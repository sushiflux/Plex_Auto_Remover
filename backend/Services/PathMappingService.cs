using PlexAutoRemover.Models;

namespace PlexAutoRemover.Services;

public static class PathMappingService
{
    /// <summary>
    /// Maps a Plex-reported file path to the corresponding local path inside this container.
    /// Returns null if no configured prefix matches.
    /// </summary>
    public static string? MapToLocalPath(string plexFilePath, IReadOnlyList<PathMappingRule> rules)
    {
        if (string.IsNullOrWhiteSpace(plexFilePath))
            return null;

        var normalizedInput = plexFilePath.Replace('\\', '/');

        foreach (var rule in rules)
        {
            if (string.IsNullOrWhiteSpace(rule.PlexPrefix) || string.IsNullOrWhiteSpace(rule.LocalPrefix))
                continue;

            var plexPrefix = rule.PlexPrefix.Replace('\\', '/').TrimEnd('/');
            var localPrefix = rule.LocalPrefix.Replace('\\', '/').TrimEnd('/');

            if (normalizedInput.Equals(plexPrefix, StringComparison.OrdinalIgnoreCase))
                return localPrefix;

            if (normalizedInput.StartsWith(plexPrefix + "/", StringComparison.OrdinalIgnoreCase))
            {
                var relative = normalizedInput[plexPrefix.Length..].TrimStart('/');
                var combined = Path.GetFullPath(Path.Combine(localPrefix, relative));
                var fullRoot = Path.GetFullPath(localPrefix + Path.DirectorySeparatorChar);

                // Prevent path traversal outside the configured local root.
                if (combined.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                    return combined;
            }
        }

        // If no rules are configured, allow direct local path only when it exists on disk.
        if (rules.Count == 0 && Path.IsPathRooted(plexFilePath))
            return Path.GetFullPath(plexFilePath);

        return null;
    }

    public static bool IsInsideAllowedRoots(string localPath, IReadOnlyList<PathMappingRule> rules)
    {
        if (string.IsNullOrWhiteSpace(localPath))
            return false;

        var fullTarget = Path.GetFullPath(localPath);
        if (rules.Count == 0)
            return false;

        foreach (var rule in rules)
        {
            if (string.IsNullOrWhiteSpace(rule.LocalPrefix))
                continue;

            var fullRoot = Path.GetFullPath(rule.LocalPrefix.TrimEnd('/', '\\') + Path.DirectorySeparatorChar);
            if (fullTarget.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }
}
