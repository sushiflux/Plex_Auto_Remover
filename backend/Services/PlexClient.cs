using System.Net.Http.Headers;
using System.Text.Json;

namespace PlexAutoRemover.Services;

public sealed class PlexConnectionResult
{
    public bool Success { get; init; }
    public string? ServerName { get; init; }
    public string? Version { get; init; }
    public string? Platform { get; init; }
    public string? Error { get; init; }
}

public sealed class PlexLibrarySection
{
    public string Key { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Type { get; init; } = string.Empty; // "movie" | "show"
}

public sealed class PlexMediaItem
{
    public string RatingKey { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public int? Year { get; init; }
    public string Type { get; init; } = string.Empty;
    public string ThumbPath { get; init; } = string.Empty;
    public DateTimeOffset AddedAt { get; init; }
    public DateTimeOffset? LastViewedAt { get; init; }
    public int ViewCount { get; init; }
    public string FilePath { get; init; } = string.Empty;
    public long FileSizeBytes { get; init; }
    public bool HasKeepLabel { get; init; }
}

public sealed class PlexClient(IHttpClientFactory httpClientFactory)
{
    private HttpClient CreateClient(string baseUrl, string token)
    {
        var client = httpClientFactory.CreateClient("plex");
        client.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        client.Timeout = TimeSpan.FromSeconds(20);
        client.DefaultRequestHeaders.Accept.Clear();
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        client.DefaultRequestHeaders.Remove("X-Plex-Token");
        client.DefaultRequestHeaders.Add("X-Plex-Token", token);
        return client;
    }

    public async Task<PlexConnectionResult> TestConnectionAsync(string baseUrl, string token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(token))
        {
            return new PlexConnectionResult
            {
                Success = false,
                Error = "Plex URL and Plex Token are required."
            };
        }

        try
        {
            using var client = CreateClient(baseUrl, token);
            using var resp = await client.GetAsync("", ct);
            if (!resp.IsSuccessStatusCode)
            {
                return new PlexConnectionResult
                {
                    Success = false,
                    Error = $"Plex returned HTTP {(int)resp.StatusCode} ({resp.ReasonPhrase})."
                };
            }

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var mc = doc.RootElement.GetProperty("MediaContainer");
            return new PlexConnectionResult
            {
                Success = true,
                ServerName = mc.TryGetProperty("friendlyName", out var fn) ? fn.GetString() : "Plex Media Server",
                Version = mc.TryGetProperty("version", out var v) ? v.GetString() : null,
                Platform = mc.TryGetProperty("platform", out var p) ? p.GetString() : null
            };
        }
        catch (Exception ex)
        {
            return new PlexConnectionResult
            {
                Success = false,
                Error = $"Could not reach Plex server: {ex.Message}"
            };
        }
    }

    public async Task<IReadOnlyList<PlexLibrarySection>> GetLibrariesAsync(string baseUrl, string token, CancellationToken ct = default)
    {
        using var client = CreateClient(baseUrl, token);
        using var resp = await client.GetAsync("library/sections", ct);
        resp.EnsureSuccessStatusCode();

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var list = new List<PlexLibrarySection>();

        if (!doc.RootElement.TryGetProperty("MediaContainer", out var mc) ||
            !mc.TryGetProperty("Directory", out var dirs))
        {
            return list;
        }

        foreach (var dir in dirs.EnumerateArray())
        {
            var type = dir.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
            if (type is not ("movie" or "show"))
                continue;

            list.Add(new PlexLibrarySection
            {
                Key = dir.GetProperty("key").GetString() ?? "",
                Title = dir.GetProperty("title").GetString() ?? "",
                Type = type
            });
        }

        return list;
    }

    public async Task<IReadOnlyList<PlexMediaItem>> GetLibraryItemsAsync(string baseUrl, string token, string sectionKey, CancellationToken ct = default)
    {
        using var client = CreateClient(baseUrl, token);
        using var resp = await client.GetAsync($"library/sections/{Uri.EscapeDataString(sectionKey)}/all", ct);
        resp.EnsureSuccessStatusCode();

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var items = new List<PlexMediaItem>();

        if (!doc.RootElement.TryGetProperty("MediaContainer", out var mc) ||
            !mc.TryGetProperty("Metadata", out var meta))
        {
            return items;
        }

        foreach (var el in meta.EnumerateArray())
        {
            items.Add(ParseMetadataElement(el));
        }

        return items;
    }

    public async Task<IReadOnlyList<PlexMediaItem>> GetShowEpisodesAsync(string baseUrl, string token, string showRatingKey, CancellationToken ct = default)
    {
        using var client = CreateClient(baseUrl, token);
        using var resp = await client.GetAsync($"library/metadata/{Uri.EscapeDataString(showRatingKey)}/allLeaves", ct);
        resp.EnsureSuccessStatusCode();

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var items = new List<PlexMediaItem>();

        if (!doc.RootElement.TryGetProperty("MediaContainer", out var mc) ||
            !mc.TryGetProperty("Metadata", out var meta))
        {
            return items;
        }

        foreach (var el in meta.EnumerateArray())
        {
            items.Add(ParseMetadataElement(el));
        }

        return items;
    }

    public async Task TriggerLibraryRefreshAsync(string baseUrl, string token, string sectionKey, CancellationToken ct = default)
    {
        using var client = CreateClient(baseUrl, token);
        using var resp = await client.GetAsync($"library/sections/{Uri.EscapeDataString(sectionKey)}/refresh", ct);
        resp.EnsureSuccessStatusCode();
    }

    /// <summary>
    /// Returns the latest viewed timestamp per ratingKey across all Plex users/accounts on the server.
    /// </summary>
    public async Task<Dictionary<string, DateTimeOffset>> GetGlobalWatchHistoryAsync(string baseUrl, string token, CancellationToken ct = default)
    {
        var result = new Dictionary<string, DateTimeOffset>(StringComparer.Ordinal);
        try
        {
            using var client = CreateClient(baseUrl, token);
            using var resp = await client.GetAsync("status/sessions/history/all", ct);
            if (!resp.IsSuccessStatusCode)
                return result;

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (!doc.RootElement.TryGetProperty("MediaContainer", out var mc) ||
                !mc.TryGetProperty("Metadata", out var meta))
            {
                return result;
            }

            foreach (var el in meta.EnumerateArray())
            {
                string? rk = null;
                if (el.TryGetProperty("ratingKey", out var r))
                {
                    rk = r.ValueKind == JsonValueKind.Number ? r.GetInt64().ToString() : r.GetString();
                }

                long viewedUnix = 0;
                if (el.TryGetProperty("viewedAt", out var v))
                {
                    viewedUnix = v.ValueKind == JsonValueKind.Number ? v.GetInt64() : (long.TryParse(v.GetString(), out var pv) ? pv : 0);
                }

                if (string.IsNullOrEmpty(rk) || viewedUnix <= 0)
                    continue;

                var dt = DateTimeOffset.FromUnixTimeSeconds(viewedUnix);
                if (!result.TryGetValue(rk, out var existing) || dt > existing)
                    result[rk] = dt;
            }
        }
        catch
        {
            // Fallback gracefully to per-item metadata when history endpoint is unavailable
        }

        return result;
    }

    public async Task<(byte[] Bytes, string ContentType)?> GetThumbAsync(string baseUrl, string token, string thumbPath, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(thumbPath) || !thumbPath.StartsWith('/'))
            return null;

        using var client = CreateClient(baseUrl, token);
        using var resp = await client.GetAsync(thumbPath.TrimStart('/'), ct);
        if (!resp.IsSuccessStatusCode)
            return null;

        var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
        var contentType = resp.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
        return (bytes, contentType);
    }

    private static PlexMediaItem ParseMetadataElement(JsonElement el)
    {
        var addedUnix = el.TryGetProperty("addedAt", out var a) ? a.GetInt64() : 0;
        var viewedUnix = el.TryGetProperty("lastViewedAt", out var lv) ? lv.GetInt64() : 0;
        var viewCount = el.TryGetProperty("viewCount", out var vc) ? vc.GetInt32() : 0;

        string filePath = string.Empty;
        long totalSize = 0;
        if (el.TryGetProperty("Media", out var mediaArr))
        {
            foreach (var media in mediaArr.EnumerateArray())
            {
                if (!media.TryGetProperty("Part", out var partArr))
                    continue;
                foreach (var part in partArr.EnumerateArray())
                {
                    if (string.IsNullOrEmpty(filePath) && part.TryGetProperty("file", out var f))
                        filePath = f.GetString() ?? "";
                    if (part.TryGetProperty("size", out var s))
                        totalSize += s.GetInt64();
                }
            }
        }

        var hasKeepLabel = false;
        if (el.TryGetProperty("Label", out var labelArr))
        {
            foreach (var lbl in labelArr.EnumerateArray())
            {
                var tag = lbl.TryGetProperty("tag", out var t) ? t.GetString() : null;
                if (string.Equals(tag, "keep", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(tag, "no-delete", StringComparison.OrdinalIgnoreCase))
                {
                    hasKeepLabel = true;
                    break;
                }
            }
        }

        return new PlexMediaItem
        {
            RatingKey = el.TryGetProperty("ratingKey", out var rk) ? rk.GetString() ?? "" : "",
            Title = el.TryGetProperty("title", out var tt) ? tt.GetString() ?? "" : "",
            Year = el.TryGetProperty("year", out var yr) && yr.ValueKind == JsonValueKind.Number ? yr.GetInt32() : null,
            Type = el.TryGetProperty("type", out var tp) ? tp.GetString() ?? "" : "",
            ThumbPath = el.TryGetProperty("thumb", out var th) ? th.GetString() ?? "" : "",
            AddedAt = addedUnix > 0 ? DateTimeOffset.FromUnixTimeSeconds(addedUnix) : DateTimeOffset.UtcNow,
            LastViewedAt = viewedUnix > 0 ? DateTimeOffset.FromUnixTimeSeconds(viewedUnix) : null,
            ViewCount = viewCount,
            FilePath = filePath,
            FileSizeBytes = totalSize,
            HasKeepLabel = hasKeepLabel
        };
    }
}
