using System.Net.Http.Json;

namespace PlexAutoRemover.Services;

public sealed class DiscordWebhookService(IHttpClientFactory httpClientFactory)
{
    public static bool IsValidDiscordWebhookUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return false;

        return Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
               uri.Scheme == Uri.UriSchemeHttps &&
               (uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) ||
                uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase)) &&
               uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<(bool Success, string? Error)> SendScanNotificationAsync(
        string webhookUrl,
        int candidateCount,
        long totalBytes,
        string? appPublicUrl,
        CancellationToken ct = default)
    {
        if (!IsValidDiscordWebhookUrl(webhookUrl))
            return (false, "Invalid Discord webhook URL (must start with https://discord.com/api/webhooks/).");

        var sizeGb = totalBytes / (1024.0 * 1024.0 * 1024.0);
        var linkText = string.IsNullOrWhiteSpace(appPublicUrl)
            ? "Öffne die Plex Auto Remover Web-UI auf deinem Unraid-Server, um die Liste zu prüfen."
            : $"[Jetzt in der Web-UI prüfen & bestätigen]({appPublicUrl.TrimEnd('/')}/?tab=candidates)";

        var payload = new
        {
            username = "Plex Auto Remover",
            embeds = new[]
            {
                new
                {
                    title = "Plex-Speicherprüfung abgeschlossen",
                    description = $"Es wurden **{candidateCount}** unberührte Medien gefunden (**{sizeGb:F2} GB** potenziell frei).\n\n{linkText}",
                    color = 0xE5A00D
                }
            }
        };

        try
        {
            var client = httpClientFactory.CreateClient("discord");
            client.Timeout = TimeSpan.FromSeconds(10);
            using var resp = await client.PostAsJsonAsync(webhookUrl, payload, ct);
            if (!resp.IsSuccessStatusCode)
                return (false, $"Discord returned HTTP {(int)resp.StatusCode}.");

            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, $"Discord webhook failed: {ex.Message}");
        }
    }
}
