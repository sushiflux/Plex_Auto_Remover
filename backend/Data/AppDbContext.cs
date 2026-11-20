using Microsoft.EntityFrameworkCore;
using PlexAutoRemover.Models;

namespace PlexAutoRemover.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppSettings> Settings => Set<AppSettings>();
    public DbSet<MediaCandidate> Candidates => Set<MediaCandidate>();
    public DbSet<WhitelistEntry> Whitelist => Set<WhitelistEntry>();
    public DbSet<DeletionLog> DeletionLogs => Set<DeletionLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppSettings>().HasKey(x => x.Id);
        modelBuilder.Entity<MediaCandidate>().HasIndex(x => x.PlexRatingKey);
        modelBuilder.Entity<MediaCandidate>().HasIndex(x => x.Status);
        modelBuilder.Entity<WhitelistEntry>().HasIndex(x => x.PlexRatingKey).IsUnique();
        modelBuilder.Entity<DeletionLog>().HasIndex(x => x.ExecutedAt);
    }

    public static async Task InitializeAsync(AppDbContext db, CancellationToken ct = default)
    {
        await db.Database.EnsureCreatedAsync(ct);
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);
        await db.Database.ExecuteSqlRawAsync("PRAGMA quick_check;", ct);

        if (!await db.Settings.AnyAsync(ct))
        {
            db.Settings.Add(new AppSettings
            {
                Id = 1,
                InactivityDays = 90,
                ScanIntervalDays = 90,
                DryRun = false,
                DeleteEmptyFolders = true
            });
            await db.SaveChangesAsync(ct);
        }
    }
}
