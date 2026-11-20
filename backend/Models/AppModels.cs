namespace PlexAutoRemover.Models;

public sealed class AppSettings
{
    public int Id { get; set; } = 1;
    public string PlexUrl { get; set; } = string.Empty;
    public string PlexToken { get; set; } = string.Empty;
    public int InactivityDays { get; set; } = 90;
    public int ScanIntervalDays { get; set; } = 90;
    public bool DryRun { get; set; } = false;
    public bool AutoDeleteOnScan { get; set; } = false;
    public bool DeleteEmptyFolders { get; set; } = true;
    public string DiscordWebhookUrl { get; set; } = string.Empty;
    public string AppPublicUrl { get; set; } = string.Empty;
    public string PathMappingsJson { get; set; } = "[]";
    public string ExcludedLibrariesJson { get; set; } = "[]";
    public string UpdateChannel { get; set; } = "release"; // "release" | "beta" | "nightly"
    public DateTimeOffset? LastScanAt { get; set; }
    public DateTimeOffset? NextScanAt { get; set; }
}

public sealed class PathMappingRule
{
    public string PlexPrefix { get; set; } = string.Empty;
    public string LocalPrefix { get; set; } = string.Empty;
}

public sealed class MediaCandidate
{
    public int Id { get; set; }
    public string PlexRatingKey { get; set; } = string.Empty;
    public string LibrarySectionId { get; set; } = string.Empty;
    public string LibraryTitle { get; set; } = string.Empty;
    public string MediaType { get; set; } = "movie"; // "movie" | "show"
    public string Title { get; set; } = string.Empty;
    public int? Year { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string MappedLocalPath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public DateTimeOffset AddedAt { get; set; }
    public DateTimeOffset? LastViewedAt { get; set; }
    public int ViewCount { get; set; }
    public int DaysSinceTouched { get; set; }
    public string Status { get; set; } = "pending"; // "pending" | "kept" | "deleted"
    public string ThumbPath { get; set; } = string.Empty;
    public DateTimeOffset DetectedAt { get; set; }
}

public sealed class WhitelistEntry
{
    public int Id { get; set; }
    public string PlexRatingKey { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string MediaType { get; set; } = "movie";
    public string Reason { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class DeletionLog
{
    public int Id { get; set; }
    public string PlexRatingKey { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string MediaType { get; set; } = "movie";
    public string FilePath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public bool WasDryRun { get; set; }
    public bool Succeeded { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset ExecutedAt { get; set; }
}
