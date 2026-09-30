/**
 * Set by the library just before it opens /scan, so the scan screen
 * knows that leaving can be a step back in history rather than a new
 * page. Session storage: it only has to survive the one navigation.
 */
export const SCAN_FROM_LIBRARY = "library:scan-from-library";
