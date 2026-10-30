# Filter-Aware Dashboard Statistics

## Feature

Dashboard statistics (Box 1, Box 2, Box 3 card counts) now dynamically update to reflect only cards matching the user's active filters.

## How It Works

### Backend Changes

1. **getProgressStats() Function** ([src/auth/practice.mjs](file:///home/tmann/Documents/Projects/FlashCards/src/auth/practice.mjs:612))
   - Now accepts optional `filters` parameter: `{class, lesson, category}`
   - Applies the same filtering logic as `getDueCardsForToday()`
   - Joins `flashcard_leitner_progress` with `flashcards` table
   - Uses `COALESCE()` to handle NULL values in class/category fields
   - Returns box counts for only matching cards

2. **API Endpoint** ([src/routes/practice.mjs](file:///home/tmann/Documents/Projects/FlashCards/src/routes/practice.mjs:332))
   - GET `/api/practice/stats` now accepts filter query parameters:
     - `?class=Biology`
     - `?lesson=Chapter1`
     - `?category=Science`
   - Extracts filters and passes them to `getProgressStats()`
   - Returns filtered statistics

### Frontend Changes

1. **refreshStatsForActiveFilters()** ([src/views/practice.ejs](file:///home/tmann/Documents/Projects/FlashCards/src/views/practice.ejs:566))
   - Reads filters from `sessionStorage.getItem('studyFilters')`
   - Calls `/api/practice/stats` with filter parameters
   - Updates the dashboard stats cards with filtered counts

2. **Event Listener** ([src/views/practice.ejs](file:///home/tmann/Documents/Projects/FlashCards/src/views/practice.ejs:609))
   - Listens for `filtersChanged` event from filter panel
   - Automatically calls `refreshStatsForActiveFilters()`
   - Triggers `loadNextCard()` to load a card matching new filters

## User Experience

### Example Scenario

1. User has 50 total flashcards across multiple classes
2. Dashboard initially shows all 50 cards distributed across boxes
3. User selects filter: "Biology" class
4. Dashboard updates to show only Biology cards (e.g., 12 cards)
5. Box counts reflect only Biology cards
6. User changes filter to "Chemistry"
7. Dashboard immediately updates to show only Chemistry cards

## Implementation Details

### Filter Application

- **Class filter** with wildcard support: "Bio*" matches "Biology", "Biome", etc.
- **Lesson filter**: matches exact lesson names (case-insensitive)
- **Category filter**: matches exact categories (case-insensitive)
- Multiple filters use AND logic (must match class AND lesson AND category)

### NULL Handling

Uses `COALESCE(field, '')` to handle NULL values:

```sql
WHERE COALESCE(class, '') = COALESCE($4, '')
  AND COALESCE(category, '') = COALESCE($5, '')
```

### Performance

- Stats endpoint is called independently
- Only executed when filters change or when user requests stats
- Does not affect card loading performance
- Minimal database query overhead (single JOIN, grouped by box)

## Testing

### Manual Test Steps

1. Add flashcards in multiple classes/categories
2. Navigate to Practice page
3. Note the initial Box 1/2/3 counts
4. Open filter panel and select a specific class
5. Verify stats update to show only cards in that class
6. Change filter to different class
7. Verify stats update again
8. Check server logs for debug output:
   ```
   [DEBUG] getProgressStats - Filters: class=Bio*, lesson=null, category=null
   [DEBUG] getProgressStats - Box counts: box1=5, box2=3, box3=2
   ```

## Debug Logging

Server logs include detailed filtering information:

- Filter parameters received
- SQL filter clause generated
- Box counts returned
- Stats sent to frontend

Enable with: Check `/tmp/server.log` or browser DevTools Console

## Files Modified

- **src/auth/practice.mjs** - Added filter support to getProgressStats()
- **src/routes/practice.mjs** - Updated /api/practice/stats endpoint
- **src/views/practice.ejs** - Added refreshStatsForActiveFilters() and listener

## Commit

- `a10e4f5` - Implement filter-aware dashboard statistics

## Related Features

- [Dynamic Header Filtering](./PRACTICE_FILTERING_COMPLETE.md)
- [NULL Handling Fix](./FILTER_NULL_HANDLING_FIX.md)
