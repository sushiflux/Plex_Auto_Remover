using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PlexAutoRemover.Data;
using PlexAutoRemover.Models;

namespace PlexAutoRemover.Services;

public sealed class ScanSummary
{
    public int CandidateCount { get; init; }
    public long TotalBytes { get; init; }
    public DateTimeOffset ScannedAt { get; init; }
    public bool WebhookSent { get; init; }
    public string? WebhookError { get; init; }
}

public sealed class DeletionBatchResult
{
    public int SucceededCount { get; init; }
    public int FailedCount { get; init; }
    public long FreedBytes { get; init; }
    public bool WasDryRun { get; init; }
    public IReadOnlyList<string> Errors { get; init; } = [];
}

public sealed class ScannerService(
    AppDbContext db,
    PlexClient plexClient,
    DiscordWebhookService webhookService,
    ILogger<ScannerService> logger)
{
    public async Task<ScanSummary> RunScanAsync(bool sendNotification, CancellationToken ct = default)
    {
        var settings = await db.Settings.FirstAsync(ct);
        if (string.IsNullOrWhiteSpace(settings.PlexUrl) || string.IsNullOrWhiteSpace(settings.PlexToken))
            throw new InvalidOperationException("Plex server URL and token must be configured before scanning.");

        var rules = JsonSerializer.Deserialize<List<PathMappingRule>>(settings.PathMappingsJson) ?? [];
        var excludedLibs = JsonSerializer.Deserialize<List<string>>(settings.ExcludedLibrariesJson) ?? [];
        var whitelistedKeys = (await db.Whitelist.Select(w => w.PlexRatingKey).ToListAsync(ct)).ToHashSet(StringComparer.Ordinal);

        var now = DateTimeOffset.UtcNow;
        var thresholdDays = Math.Max(1, settings.InactivityDays);
        var libraries = await plexClient.GetLibrariesAsync(settings.PlexUrl, settings.PlexToken, ct);
        var globalHistory = await plexClient.GetGlobalWatchHistoryAsync(settings.PlexUrl, settings.PlexToken, ct);

        var newCandidates = new List<MediaCandidate>();

        foreach (var lib in libraries)
        {
            if (excludedLibs.Contains(lib.Key, StringComparer.OrdinalIgnoreCase))
                continue;

            var items = await plexClient.GetLibraryItemsAsync(settings.PlexUrl, settings.PlexToken, lib.Key, ct);
            foreach (var item in items)
            {
                if (item.HasKeepLabel || whitelistedKeys.Contains(item.RatingKey))
                    continue;

                if (lib.Type == "movie")
                {
                    var effectiveLastViewed = item.LastViewedAt;
                    if (globalHistory.TryGetValue(item.RatingKey, out var histViewed) &&
                        (!effectiveLastViewed.HasValue || histViewed > effectiveLastViewed.Value))
                    {
                        effectiveLastViewed = histViewed;
                    }

                    var lastTouched = effectiveLastViewed ?? item.AddedAt;
                    var daysSince = (int)Math.Floor((now - lastTouched).TotalDays);
                    if (daysSince < thresholdDays)
                        continue;

                    var mapped = PathMappingService.MapToLocalPath(item.FilePath, rules) ?? item.FilePath;
                    newCandidates.Add(new MediaCandidate
                    {
                        PlexRatingKey = item.RatingKey,
                        LibrarySectionId = lib.Key,
                        LibraryTitle = lib.Title,
                        MediaType = "movie",
                        Title = item.Title,
                        Year = item.Year,
                        FilePath = item.FilePath,
                        MappedLocalPath = mapped,
                        FileSizeBytes = item.FileSizeBytes,
                        AddedAt = item.AddedAt,
                        LastViewedAt = effectiveLastViewed,
                        ViewCount = item.ViewCount,
                        DaysSinceTouched = daysSince,
                        Status = "pending",
                        ThumbPath = item.ThumbPath,
                        DetectedAt = now
                    });
                }
                else if (lib.Type == "show")
                {
                    var episodes = await plexClient.GetShowEpisodesAsync(settings.PlexUrl, settings.PlexToken, item.RatingKey, ct);
                    if (episodes.Count == 0)
                        continue;

                    DateTimeOffset? latestEpisodeView = null;
                    var newestTouch = DateTimeOffset.MinValue;
                    foreach (var ep in episodes)
                    {
                        var epViewed = ep.LastViewedAt;
                        if (globalHistory.TryGetValue(ep.RatingKey, out var histViewed) &&
                            (!epViewed.HasValue || histViewed > epViewed.Value))
                        {
                            epViewed = histViewed;
                        }

                        if (epViewed.HasValue && (!latestEpisodeView.HasValue || epViewed.Value > latestEpisodeView.Value))
                            latestEpisodeView = epViewed.Value;

                        var epTouch = epViewed ?? ep.AddedAt;
                        if (epTouch > newestTouch)
                            newestTouch = epTouch;
                    }

                    var daysSince = (int)Math.Floor((now - newestTouch).TotalDays);
                    if (daysSince < thresholdDays)
                        continue;

                    var totalSize = episodes.Sum(e => e.FileSizeBytes);
                    var totalViews = episodes.Sum(e => e.ViewCount);
                    var firstFile = episodes.FirstOrDefault(e => !string.IsNullOrEmpty(e.FilePath))?.FilePath ?? string.Empty;
                    var mappedFirst = PathMappingService.MapToLocalPath(firstFile, rules) ?? firstFile;

                    // Derive show root folder (two levels up from episode file: Show/Season XX/Episode.mkv -> Show)
                    var showFolder = !string.IsNullOrEmpty(mappedFirst)
                        ? Path.GetDirectoryName(Path.GetDirectoryName(mappedFirst)) ?? Path.GetDirectoryName(mappedFirst) ?? mappedFirst
                        : string.Empty;

                    newCandidates.Add(new MediaCandidate
                    {
                        PlexRatingKey = item.RatingKey,
                        LibrarySectionId = lib.Key,
                        LibraryTitle = lib.Title,
                        MediaType = "show",
                        Title = item.Title,
                        Year = item.Year,
                        FilePath = firstFile,
                        MappedLocalPath = showFolder,
                        FileSizeBytes = totalSize,
                        AddedAt = item.AddedAt,
                        LastViewedAt = latestEpisodeView,
                        ViewCount = totalViews,
                        DaysSinceTouched = daysSince,
                        Status = "pending",
                        ThumbPath = item.ThumbPath,
                        DetectedAt = now
                    });
                }
            }
        }

        // Replace previous pending candidates with fresh scan results
        var existingPending = await db.Candidates.Where(c => c.Status == "pending").ToListAsync(ct);
        db.Candidates.RemoveRange(existingPending);
        db.Candidates.AddRange(newCandidates);

        settings.LastScanAt = now;
        settings.NextScanAt = now.AddDays(Math.Max(1, settings.ScanIntervalDays));
        await db.SaveChangesAsync(ct);

        var totalBytes = newCandidates.Sum(c => c.FileSizeBytes);
        var webhookSent = false;
        string? webhookError = null;

        if (sendNotification && newCandidates.Count > 0 && !string.IsNullOrWhiteSpace(settings.DiscordWebhookUrl))
        {
            (webhookSent, webhookError) = await webhookService.SendScanNotificationAsync(
                settings.DiscordWebhookUrl,
                newCandidates.Count,
                totalBytes,
                settings.AppPublicUrl,
                ct);
        }

        return new ScanSummary
        {
            CandidateCount = newCandidates.Count,
            TotalBytes = totalBytes,
            ScannedAt = now,
            WebhookSent = webhookSent,
            WebhookError = webhookError
        };
    }

    public async Task<DeletionBatchResult> ExecuteDeletionsAsync(
        IReadOnlyCollection<int> candidateIds,
        bool? dryRunOverride,
        CancellationToken ct = default)
    {
        var settings = await db.Settings.FirstAsync(ct);
        var isDryRun = dryRunOverride ?? settings.DryRun;
        var rules = JsonSerializer.Deserialize<List<PathMappingRule>>(settings.PathMappingsJson) ?? [];

        var candidates = await db.Candidates
            .Where(c => candidateIds.Contains(c.Id) && c.Status == "pending")
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        var errors = new List<string>();
        var touchedSections = new HashSet<string>(StringComparer.Ordinal);
        int succeeded = 0;
        long freedBytes = 0;

        foreach (var candidate in candidates)
        {
            string? error = null;

            if (!isDryRun)
            {
                try
                {
                    if (rules.Count > 0 && !PathMappingService.IsInsideAllowedRoots(candidate.MappedLocalPath, rules))
                    {
                        throw new InvalidOperationException($"Blocked deletion outside configured path mappings: {candidate.MappedLocalPath}");
                    }

                    if (candidate.MediaType == "show")
                    {
                        if (!Directory.Exists(candidate.MappedLocalPath))
                            throw new DirectoryNotFoundException($"Ordner nicht gefunden: '{candidate.MappedLocalPath}'. Bitte Pfad-Mapping prüfen.");

                        Directory.Delete(candidate.MappedLocalPath, recursive: true);
                    }
                    else
                    {
                        if (!File.Exists(candidate.MappedLocalPath))
                            throw new FileNotFoundException($"Datei nicht gefunden: '{candidate.MappedLocalPath}'. Bitte Pfad-Mapping prüfen.", candidate.MappedLocalPath);

                        File.Delete(candidate.MappedLocalPath);
                        if (settings.DeleteEmptyFolders)
                        {
                            var dir = Path.GetDirectoryName(candidate.MappedLocalPath);
                            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any())
                                Directory.Delete(dir, recursive: false);
                        }
                    }

                    candidate.Status = "deleted";
                    touchedSections.Add(candidate.LibrarySectionId);
                }
                catch (Exception ex)
                {
                    error = ex.Message;
                    errors.Add($"{candidate.Title}: {ex.Message}");
                    logger.LogWarning(ex, "Failed to delete media candidate {Title}", candidate.Title);
                }
            }

            if (error is null)
            {
                succeeded++;
                freedBytes += candidate.FileSizeBytes;
            }

            db.DeletionLogs.Add(new DeletionLog
            {
                PlexRatingKey = candidate.PlexRatingKey,
                Title = candidate.Title,
                MediaType = candidate.MediaType,
                FilePath = candidate.MappedLocalPath,
                FileSizeBytes = candidate.FileSizeBytes,
                WasDryRun = isDryRun,
                Succeeded = error is null,
                ErrorMessage = error,
                ExecutedAt = now
            });
        }

        await db.SaveChangesAsync(ct);

        if (!isDryRun && touchedSections.Count > 0 && !string.IsNullOrWhiteSpace(settings.PlexUrl) && !string.IsNullOrWhiteSpace(settings.PlexToken))
        {
            foreach (var sectionId in touchedSections)
            {
                try
                {
                    await plexClient.TriggerLibraryRefreshAsync(settings.PlexUrl, settings.PlexToken, sectionId, ct);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Could not trigger Plex refresh for section {SectionId}", sectionId);
                }
            }
        }

        return new DeletionBatchResult
        {
            SucceededCount = succeeded,
            FailedCount = errors.Count,
            FreedBytes = freedBytes,
            WasDryRun = isDryRun,
            Errors = errors
        };
    }
}
