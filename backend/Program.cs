using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PlexAutoRemover.Data;
using PlexAutoRemover.Models;
using PlexAutoRemover.Services;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
});

var configDir = Environment.GetEnvironmentVariable("CONFIG_DIR")
    ?? (Directory.Exists("/config") ? "/config" : Path.Combine(AppContext.BaseDirectory, "data"));
Directory.CreateDirectory(configDir);
var dbPath = Path.Combine(configDir, "plex-auto-remover.db");

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite($"Data Source={dbPath}"));

builder.Services.AddHttpClient("plex");
builder.Services.AddHttpClient("discord");
builder.Services.AddHttpClient("github");
builder.Services.AddScoped<PlexClient>();
builder.Services.AddScoped<DiscordWebhookService>();
builder.Services.AddScoped<ScannerService>();
builder.Services.AddSingleton<UpdateCheckService>();
builder.Services.AddHostedService<ScanSchedulerService>();

var app = builder.Build();

// Security headers for every response
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    ctx.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
    ctx.Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
    ctx.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
});

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await AppDbContext.InitializeAsync(db);
}

var appVersion = ReadAppVersion();
var isDev = app.Environment.IsDevelopment();
var channelSymbol = Environment.GetEnvironmentVariable("APP_CHANNEL_SYMBOL") ?? (isDev ? "</>" : "");
var displayVersion = string.IsNullOrEmpty(channelSymbol) ? appVersion : $"{appVersion} ({channelSymbol})";

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", version = appVersion }));

app.MapGet("/api/version", () => Results.Ok(new
{
    version = appVersion,
    displayVersion,
    channelSymbol
}));

app.MapGet("/api/meta", () => Results.Ok(new
{
    productName = "Plex Auto Remover",
    version = appVersion,
    displayVersion,
    channelSymbol
}));

app.MapGet("/api/dashboard", async (AppDbContext db, CancellationToken ct) =>
{
    var settings = await db.Settings.AsNoTracking().FirstAsync(ct);
    var pending = await db.Candidates.AsNoTracking().Where(c => c.Status == "pending").ToListAsync(ct);
    var logs = await db.DeletionLogs.AsNoTracking().Where(l => !l.WasDryRun && l.Succeeded).ToListAsync(ct);
    var whitelistCount = await db.Whitelist.CountAsync(ct);

    return Results.Ok(new
    {
        plexConfigured = !string.IsNullOrWhiteSpace(settings.PlexUrl) && !string.IsNullOrWhiteSpace(settings.PlexToken),
        dryRun = settings.DryRun,
        inactivityDays = settings.InactivityDays,
        scanIntervalDays = settings.ScanIntervalDays,
        lastScanAt = settings.LastScanAt,
        nextScanAt = settings.NextScanAt,
        pendingCount = pending.Count,
        pendingBytes = pending.Sum(c => c.FileSizeBytes),
        deletedCount = logs.Count,
        freedBytes = logs.Sum(l => l.FileSizeBytes),
        whitelistCount
    });
});

app.MapGet("/api/candidates", async (AppDbContext db, CancellationToken ct) =>
{
    var items = await db.Candidates.AsNoTracking()
        .Where(c => c.Status == "pending")
        .OrderByDescending(c => c.FileSizeBytes)
        .ToListAsync(ct);
    return Results.Ok(items);
});

app.MapPost("/api/candidates/delete", async (DeleteCandidatesRequest req, ScannerService scanner, CancellationToken ct) =>
{
    if (req.CandidateIds is null || req.CandidateIds.Count == 0)
        return Results.BadRequest(new { error = "No media items were selected for deletion." });

    var result = await scanner.ExecuteDeletionsAsync(req.CandidateIds, req.DryRunOverride, ct);
    return Results.Ok(result);
});

app.MapPost("/api/candidates/{id:int}/keep", async (int id, KeepCandidateRequest? req, AppDbContext db, CancellationToken ct) =>
{
    var candidate = await db.Candidates.FirstOrDefaultAsync(c => c.Id == id, ct);
    if (candidate is null)
        return Results.NotFound(new { error = $"Candidate #{id} was not found." });

    candidate.Status = "kept";
    var exists = await db.Whitelist.AnyAsync(w => w.PlexRatingKey == candidate.PlexRatingKey, ct);
    if (!exists)
    {
        db.Whitelist.Add(new WhitelistEntry
        {
            PlexRatingKey = candidate.PlexRatingKey,
            Title = candidate.Title,
            MediaType = candidate.MediaType,
            Reason = string.IsNullOrWhiteSpace(req?.Reason) ? "Manuell geschützt" : req.Reason.Trim(),
            CreatedAt = DateTimeOffset.UtcNow
        });
    }

    await db.SaveChangesAsync(ct);
    return Results.Ok(new { ok = true });
});

app.MapGet("/api/whitelist", async (AppDbContext db, CancellationToken ct) =>
{
    var items = await db.Whitelist.AsNoTracking()
        .OrderByDescending(w => w.Id)
        .ToListAsync(ct);
    return Results.Ok(items);
});

app.MapDelete("/api/whitelist/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
{
    var entry = await db.Whitelist.FirstOrDefaultAsync(w => w.Id == id, ct);
    if (entry is null)
        return Results.NotFound(new { error = $"Whitelist entry #{id} was not found." });

    db.Whitelist.Remove(entry);
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { ok = true });
});

app.MapGet("/api/logs", async (AppDbContext db, CancellationToken ct) =>
{
    var items = await db.DeletionLogs.AsNoTracking()
        .OrderByDescending(l => l.Id)
        .Take(500)
        .ToListAsync(ct);
    return Results.Ok(items);
});

app.MapGet("/api/settings", async (AppDbContext db, CancellationToken ct) =>
{
    var s = await db.Settings.AsNoTracking().FirstAsync(ct);
    var mappings = JsonSerializer.Deserialize<List<PathMappingRule>>(s.PathMappingsJson) ?? [];
    var excluded = JsonSerializer.Deserialize<List<string>>(s.ExcludedLibrariesJson) ?? [];

    return Results.Ok(new
    {
        plexUrl = s.PlexUrl,
        hasPlexToken = !string.IsNullOrWhiteSpace(s.PlexToken),
        inactivityDays = s.InactivityDays,
        scanIntervalDays = s.ScanIntervalDays,
        dryRun = s.DryRun,
        autoDeleteOnScan = s.AutoDeleteOnScan,
        deleteEmptyFolders = s.DeleteEmptyFolders,
        discordWebhookUrl = s.DiscordWebhookUrl,
        appPublicUrl = s.AppPublicUrl,
        pathMappings = mappings,
        excludedLibraries = excluded,
        updateChannel = s.UpdateChannel,
        lastScanAt = s.LastScanAt,
        nextScanAt = s.NextScanAt
    });
});

app.MapPut("/api/settings", async (UpdateSettingsRequest req, AppDbContext db, CancellationToken ct) =>
{
    if (req.InactivityDays < 1 || req.InactivityDays > 3650)
        return Results.BadRequest(new { error = "Inactivity days must be between 1 and 3650." });

    if (req.ScanIntervalDays < 1 || req.ScanIntervalDays > 365)
        return Results.BadRequest(new { error = "Scan interval days must be between 1 and 365." });

    if (!string.IsNullOrWhiteSpace(req.PlexUrl) && !Uri.TryCreate(req.PlexUrl, UriKind.Absolute, out _))
        return Results.BadRequest(new { error = "Plex URL must be a valid http:// or https:// URL." });

    if (!string.IsNullOrWhiteSpace(req.DiscordWebhookUrl) && !DiscordWebhookService.IsValidDiscordWebhookUrl(req.DiscordWebhookUrl))
        return Results.BadRequest(new { error = "Discord webhook URL must start with https://discord.com/api/webhooks/." });

    var s = await db.Settings.FirstAsync(ct);
    s.PlexUrl = req.PlexUrl?.Trim() ?? string.Empty;
    if (!string.IsNullOrWhiteSpace(req.PlexToken))
        s.PlexToken = req.PlexToken.Trim();

    s.InactivityDays = req.InactivityDays;
    s.ScanIntervalDays = req.ScanIntervalDays;
    s.DryRun = req.DryRun;
    s.AutoDeleteOnScan = req.AutoDeleteOnScan;
    s.DeleteEmptyFolders = req.DeleteEmptyFolders;
    s.DiscordWebhookUrl = req.DiscordWebhookUrl?.Trim() ?? string.Empty;
    s.AppPublicUrl = req.AppPublicUrl?.Trim() ?? string.Empty;
    s.PathMappingsJson = JsonSerializer.Serialize(req.PathMappings ?? []);
    s.ExcludedLibrariesJson = JsonSerializer.Serialize(req.ExcludedLibraries ?? []);
    s.UpdateChannel = req.UpdateChannel is "beta" or "nightly" ? req.UpdateChannel : "release";
    s.NextScanAt ??= DateTimeOffset.UtcNow.AddDays(s.ScanIntervalDays);

    await db.SaveChangesAsync(ct);
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/settings/test-plex", async (TestPlexRequest req, AppDbContext db, PlexClient plex, CancellationToken ct) =>
{
    var s = await db.Settings.AsNoTracking().FirstAsync(ct);
    var url = string.IsNullOrWhiteSpace(req.PlexUrl) ? s.PlexUrl : req.PlexUrl.Trim();
    var token = string.IsNullOrWhiteSpace(req.PlexToken) ? s.PlexToken : req.PlexToken.Trim();
    var result = await plex.TestConnectionAsync(url, token, ct);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/settings/test-webhook", async (TestWebhookRequest req, AppDbContext db, DiscordWebhookService webhook, CancellationToken ct) =>
{
    var s = await db.Settings.AsNoTracking().FirstAsync(ct);
    var url = string.IsNullOrWhiteSpace(req.DiscordWebhookUrl) ? s.DiscordWebhookUrl : req.DiscordWebhookUrl.Trim();
    var (ok, err) = await webhook.SendScanNotificationAsync(url, 3, 18_500_000_000, s.AppPublicUrl, ct);
    return ok ? Results.Ok(new { ok = true }) : Results.BadRequest(new { error = err });
});

app.MapGet("/api/settings/libraries", async (AppDbContext db, PlexClient plex, CancellationToken ct) =>
{
    var s = await db.Settings.AsNoTracking().FirstAsync(ct);
    if (string.IsNullOrWhiteSpace(s.PlexUrl) || string.IsNullOrWhiteSpace(s.PlexToken))
        return Results.Ok(Array.Empty<PlexLibrarySection>());

    var libs = await plex.GetLibrariesAsync(s.PlexUrl, s.PlexToken, ct);
    return Results.Ok(libs);
});

app.MapPost("/api/scan", async (ScanRequest? req, ScannerService scanner, CancellationToken ct) =>
{
    try
    {
        var summary = await scanner.RunScanAsync(req?.SendNotification ?? false, ct);
        return Results.Ok(summary);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "Scan failed", detail: ex.Message, statusCode: 500);
    }
});

app.MapGet("/api/updates", async (bool? force, AppDbContext db, UpdateCheckService updater, CancellationToken ct) =>
{
    var s = await db.Settings.AsNoTracking().FirstAsync(ct);
    var isManual = force == true;
    if (isDev && !isManual)
    {
        return Results.Ok(new UpdateCheckResult
        {
            UpdateAvailable = false,
            CurrentVersion = appVersion,
            SelectedChannel = s.UpdateChannel,
            DockerTag = s.UpdateChannel is "beta" or "nightly" ? s.UpdateChannel : "latest",
            CheckedAt = DateTimeOffset.UtcNow
        });
    }

    var result = await updater.CheckAsync(appVersion, s.UpdateChannel, isManual, ct);
    return Results.Ok(result);
});

app.MapGet("/api/manual/{lang}", (string lang, bool? download) =>
{
    var isDe = string.Equals(lang, "de", StringComparison.OrdinalIgnoreCase);
    var fileName = isDe ? "Plex-Auto-Remover-Handbuch.pdf" : "Plex-Auto-Remover-Handbook.pdf";
    var candidates = new[]
    {
        Path.Combine(AppContext.BaseDirectory, "docs", "handbuch", fileName),
        Path.Combine(Directory.GetCurrentDirectory(), "..", "docs", "handbuch", fileName),
        Path.Combine(Directory.GetCurrentDirectory(), "docs", "handbuch", fileName)
    };

    var found = candidates.FirstOrDefault(File.Exists);
    if (found is null)
        return Results.NotFound(new { error = $"Manual PDF '{fileName}' was not found." });

    if (download == true)
        return Results.File(found, "application/pdf", fileDownloadName: fileName);

    return Results.File(found, "application/pdf");
});

app.MapGet("/api/plex/thumb", async (string path, AppDbContext db, PlexClient plex, CancellationToken ct) =>
{
    var s = await db.Settings.AsNoTracking().FirstAsync(ct);
    if (string.IsNullOrWhiteSpace(s.PlexUrl) || string.IsNullOrWhiteSpace(s.PlexToken))
        return Results.NotFound();

    var thumb = await plex.GetThumbAsync(s.PlexUrl, s.PlexToken, path, ct);
    return thumb is null ? Results.NotFound() : Results.File(thumb.Value.Bytes, thumb.Value.ContentType);
});

var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
if (Directory.Exists(wwwroot))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    app.MapFallbackToFile("index.html");
}

app.Run();

static string ReadAppVersion()
{
    var env = Environment.GetEnvironmentVariable("APP_VERSION");
    if (!string.IsNullOrWhiteSpace(env))
        return env.Trim();

    var candidates = new[]
    {
        Path.Combine(AppContext.BaseDirectory, "version.txt"),
        Path.Combine(Directory.GetCurrentDirectory(), "..", "version.txt"),
        Path.Combine(Directory.GetCurrentDirectory(), "version.txt")
    };

    foreach (var path in candidates)
    {
        if (File.Exists(path))
        {
            var lines = File.ReadAllLines(path)
                .Select(l => l.Trim())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToArray();
            if (lines.Length >= 2)
                return lines[1];
            if (lines.Length == 1)
                return lines[0];
        }
    }

    return "v2026.11.0.0.0";
}

public sealed record DeleteCandidatesRequest(IReadOnlyCollection<int> CandidateIds, bool? DryRunOverride);
public sealed record KeepCandidateRequest(string? Reason);
public sealed record UpdateSettingsRequest(
    string? PlexUrl,
    string? PlexToken,
    int InactivityDays,
    int ScanIntervalDays,
    bool DryRun,
    bool AutoDeleteOnScan,
    bool DeleteEmptyFolders,
    string? DiscordWebhookUrl,
    string? AppPublicUrl,
    List<PathMappingRule>? PathMappings,
    List<string>? ExcludedLibraries,
    string? UpdateChannel);
public sealed record TestPlexRequest(string? PlexUrl, string? PlexToken);
public sealed record TestWebhookRequest(string? DiscordWebhookUrl);
public sealed record ScanRequest(bool SendNotification = false);
