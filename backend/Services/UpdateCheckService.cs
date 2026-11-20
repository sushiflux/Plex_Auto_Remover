using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlexAutoRemover.Services;

public sealed class UpdateCheckResult
{
    public bool UpdateAvailable { get; init; }
    public string CurrentVersion { get; init; } = string.Empty;
    public string? LatestVersion { get; init; }
    public string LatestChannel { get; init; } = "release"; // "release" | "beta" | "nightly"
    public string SelectedChannel { get; init; } = "release";
    public string DockerTag { get; init; } = "latest";
    public string? ReleaseUrl { get; init; }
    public DateTimeOffset CheckedAt { get; init; }
    public string? Error { get; init; }
}

public sealed partial class UpdateCheckService(IHttpClientFactory httpClientFactory)
{
    private const string ReleasesApiUrl = "https://api.github.com/repos/sushiflux/Plex_Auto_Remover/releases?per_page=30";

    private UpdateCheckResult? _cached;
    private string? _cachedChannel;
    private DateTimeOffset _cachedAt;

    [GeneratedRegex(@"^v(?<y>\d+)\.(?<m>\d+)\.(?<c>\d+)(?:\.(?<p>\d+)\.(?<l>\d+))?(?:-(?<ch>beta|nightly))?$", RegexOptions.IgnoreCase)]
    private static partial Regex VersionRegex();

    public async Task<UpdateCheckResult> CheckAsync(
        string currentVersion,
        string selectedChannel,
        bool force,
        CancellationToken ct = default)
    {
        var normalizedChannel = selectedChannel is "beta" or "nightly" ? selectedChannel : "release";
        var now = DateTimeOffset.UtcNow;

        if (!force &&
            _cached is not null &&
            _cachedChannel == normalizedChannel &&
            (now - _cachedAt) < TimeSpan.FromHours(1))
        {
            return _cached;
        }

        try
        {
            var client = httpClientFactory.CreateClient("github");
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.UserAgent.Clear();
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("PlexAutoRemover", "1.0"));
            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));

            using var resp = await client.GetAsync(ReleasesApiUrl, ct);
            if (!resp.IsSuccessStatusCode)
            {
                return new UpdateCheckResult
                {
                    UpdateAvailable = false,
                    CurrentVersion = currentVersion,
                    SelectedChannel = normalizedChannel,
                    DockerTag = ChannelToDockerTag(normalizedChannel),
                    CheckedAt = now,
                    Error = $"GitHub returned HTTP {(int)resp.StatusCode} ({resp.ReasonPhrase})."
                };
            }

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            ParsedVersion? best = null;
            string? bestUrl = null;
            string? bestTag = null;

            foreach (var rel in doc.RootElement.EnumerateArray())
            {
                if (rel.TryGetProperty("draft", out var d) && d.GetBoolean())
                    continue;

                var tag = rel.TryGetProperty("tag_name", out var tn) ? tn.GetString() ?? "" : "";
                var parsed = ParseVersion(tag);
                if (parsed is null)
                    continue;

                if (!ChannelAccepts(normalizedChannel, parsed.Value.Channel))
                    continue;

                if (best is null || CompareVersions(parsed.Value, best.Value) > 0)
                {
                    best = parsed;
                    bestTag = tag;
                    bestUrl = rel.TryGetProperty("html_url", out var hu) ? hu.GetString() : null;
                }
            }

            var currentParsed = ParseVersion(currentVersion);
            var updateAvailable = best is not null &&
                                  (currentParsed is null || CompareVersions(best.Value, currentParsed.Value) > 0);

            var result = new UpdateCheckResult
            {
                UpdateAvailable = updateAvailable,
                CurrentVersion = currentVersion,
                LatestVersion = bestTag,
                LatestChannel = best?.Channel ?? "release",
                SelectedChannel = normalizedChannel,
                DockerTag = ChannelToDockerTag(normalizedChannel),
                ReleaseUrl = bestUrl,
                CheckedAt = now
            };

            _cached = result;
            _cachedChannel = normalizedChannel;
            _cachedAt = now;
            return result;
        }
        catch (Exception ex)
        {
            return new UpdateCheckResult
            {
                UpdateAvailable = false,
                CurrentVersion = currentVersion,
                SelectedChannel = normalizedChannel,
                DockerTag = ChannelToDockerTag(normalizedChannel),
                CheckedAt = now,
                Error = $"Update check failed: {ex.Message}"
            };
        }
    }

    private static string ChannelToDockerTag(string channel) => channel switch
    {
        "beta" => "beta",
        "nightly" => "nightly",
        _ => "latest"
    };

    private static bool ChannelAccepts(string selected, string itemChannel) => selected switch
    {
        "release" => itemChannel == "release",
        "beta" => itemChannel is "beta" or "release",
        "nightly" => itemChannel is "nightly" or "release",
        _ => itemChannel == "release"
    };

    private readonly record struct ParsedVersion(int Year, int Month, int Commit, int Prompts, int Lines, string Channel)
    {
        public int ChannelPriority => Channel switch
        {
            "release" => 3,
            "beta" => 2,
            "nightly" => 1,
            _ => 0
        };
    }

    private static ParsedVersion? ParseVersion(string input)
    {
        var m = VersionRegex().Match(input.Trim());
        if (!m.Success)
            return null;

        return new ParsedVersion(
            int.Parse(m.Groups["y"].Value),
            int.Parse(m.Groups["m"].Value),
            int.Parse(m.Groups["c"].Value),
            m.Groups["p"].Success ? int.Parse(m.Groups["p"].Value) : 0,
            m.Groups["l"].Success ? int.Parse(m.Groups["l"].Value) : 0,
            m.Groups["ch"].Success ? m.Groups["ch"].Value.ToLowerInvariant() : "release");
    }

    private static int CompareVersions(ParsedVersion a, ParsedVersion b)
    {
        int cmp = a.Year.CompareTo(b.Year);
        if (cmp != 0) return cmp;
        cmp = a.Month.CompareTo(b.Month);
        if (cmp != 0) return cmp;
        cmp = a.Commit.CompareTo(b.Commit);
        if (cmp != 0) return cmp;
        cmp = a.ChannelPriority.CompareTo(b.ChannelPriority);
        if (cmp != 0) return cmp;
        cmp = a.Prompts.CompareTo(b.Prompts);
        if (cmp != 0) return cmp;
        return a.Lines.CompareTo(b.Lines);
    }
}
