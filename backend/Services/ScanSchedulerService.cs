using Microsoft.EntityFrameworkCore;
using PlexAutoRemover.Data;

namespace PlexAutoRemover.Services;

public sealed class ScanSchedulerService(
    IServiceScopeFactory scopeFactory,
    ILogger<ScanSchedulerService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Check once per hour whether a scheduled scan is due
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAndRunIfDueAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Scheduled scan check failed");
            }

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task CheckAndRunIfDueAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var settings = await db.Settings.FirstOrDefaultAsync(ct);
        if (settings is null || string.IsNullOrWhiteSpace(settings.PlexUrl) || string.IsNullOrWhiteSpace(settings.PlexToken))
            return;

        if (!settings.NextScanAt.HasValue || settings.NextScanAt.Value > DateTimeOffset.UtcNow)
            return;

        var scanner = scope.ServiceProvider.GetRequiredService<ScannerService>();
        logger.LogInformation("Starting scheduled Plex scan");
        await scanner.RunScanAsync(sendNotification: true, ct);
    }
}
