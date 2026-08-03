// The LMS pref `browseagelimit` truncates `sort:new` at this many rows, and
// paginating past it returns nothing. The server clamps its pages to it, the
// client explains the resulting end of the list — both must read the same
// number or the explanation lies.
export const RECENTLY_ADDED_ALBUM_LIMIT = 100;
