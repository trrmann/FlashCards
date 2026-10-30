# Filter Handling and NULL Class/Category Fix

## Problem

When practicing with wildcard filters that should have produced multiple matching cards, the system was displaying "More Entries Needed" message instead of showing practice cards, even though sufficient cards existed in the database.

## Root Cause

In `generateMultipleChoiceOptions()`, the wrong answer lookup was using exact equality comparison:

```sql
WHERE ...
  AND class = $4
  AND category = $5
```

In SQL, `NULL = NULL` evaluates to `NULL` (unknown), not `TRUE`. This means:

- If a flashcard had `class = NULL` or `category = NULL`
- And we tried to find wrong answers with matching class/category
- The query would return **zero results** because `NULL = NULL` is false
- This triggered the "insufficient entries" condition (< 2 options)

## Solution

Use `COALESCE()` to treat NULL values as empty strings, ensuring NULL matches NULL:

```sql
WHERE ...
  AND COALESCE(class, '') = COALESCE($4, '')
  AND COALESCE(category, '') = COALESCE($5, '')
```

Now:

- `COALESCE(NULL, '') = COALESCE(NULL, '')` → `'' = ''` → `TRUE` ✓
- `COALESCE('Biology', '') = COALESCE('Biology', '')` → `'Biology' = 'Biology'` → `TRUE` ✓
- `COALESCE(NULL, '') = COALESCE('Biology', '')` → `'' = 'Biology'` → `FALSE` ✓

## Changes Made

### src/scripts/js/modules/auth/practice.mjs

1. Updated both wrong-answer queries in `generateMultipleChoiceOptions()`:
   - Standard mode (showing correct answer)
   - "None of the above" mode
   - Both now use `COALESCE(field, '')` for class and category matching

2. Added debug logging to track:
   - Card class/category values
   - Number of wrong answers found
   - Whether options are sufficient

3. Added debug logging to `getDueCardsForToday()`:
   - Logs filters and SQL patterns applied
   - Logs number of cards returned

### src/scripts/js/modules/routes/practice.mjs

- Added debug logging to see how filters are received and passed to backend
- Logs number of due cards found for the session

## Testing

Run practice with wildcard filters:

- Example: "Bio*" should match "Biology", "Biome", etc.
- Should now display cards instead of "More Entries Needed"

Watch server logs for debug output:

```
[DEBUG] getDueCardsForToday - Filters: class=Bio*, lesson=null, category=null
[DEBUG] getDueCardsForToday - Result count: 5
[DEBUG] generateMultipleChoiceOptions - Found 3 wrong answers
[DEBUG] generateMultipleChoiceOptions - Total options: 4
```

## Impact

- ✅ Filters now work correctly with wildcard patterns
- ✅ Cards with NULL class/category fields no longer break option generation
- ✅ Users can practice with appropriate filter constraints
- ✅ Multiple choice options are now properly generated

## Files Modified

- src/scripts/js/modules/auth/practice.mjs - Core filtering logic fix + debug logging
- src/scripts/js/modules/routes/practice.mjs - API endpoint debug logging

## Commits

- `9d0f0c6` - Main fix: handle NULL class/category values
- `017581c` - Debug logging for troubleshooting
