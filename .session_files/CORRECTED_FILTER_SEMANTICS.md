# ✅ CORRECTED: Filter Semantics - Category=NULL for Unfiltered Attempts

**Issue Found:** Backfill was incorrectly populating old attempts with card categories

**Correct Behavior:**

- Attempts made WITHOUT a filter → `category=NULL` (wildcard/unfiltered state)
- Attempts made WITH a filter → `category=specific_value` (explicit filter)
- Filter should only count attempts made WITH that filter, not retroactively apply to old attempts

## Test Results - CORRECT SEMANTICS ✅

### Test 1: WILDCARD (No filters applied)

- **Count:** 4 attempts ✅
- **Accuracy:** 100% (4/4 correct) ✅
- **Logic:** Shows ALL attempts including category=NULL

### Test 2: CLASS="English*" Filter

- **Count:** 4 attempts ✅
- **Accuracy:** 100% (all 4 are English Connect) ✅
- **Note:** Works because class was captured in ALL attempts

### Test 3: CATEGORY="vocabulary" Filter

- **Count:** 0 attempts ✅ (correct!)
- **Accuracy:** N/A (no attempts with this filter) ✅
- **Why:** All 4 historical attempts have `category=NULL` (made without filter)
- **Meaning:** "No practice has been done specifically with vocabulary filter selected"

## Data State (Correct)

```
practice_history (current state):
┌─────┬──────────────┬──────────────┬──────────┐
│ id  │ flashcard_id │ category     │ correct  │
├─────┼──────────────┼──────────────┼──────────┤
│ 187 │ 2aaaeb51     │ NULL ← unf…. │ ✓        │
│ 188 │ 52eacfa1     │ NULL ← unf…. │ ✓        │
│ 189 │ 52eacfa1     │ NULL ← unf…. │ ✓        │
│ 190 │ 52eacfa1     │ NULL ← unf…. │ ✓        │
└─────┴──────────────┴──────────────┴──────────┘

All category=NULL means: "These attempts were made without a category filter"
```

## Why This is Correct

When a user selects **category="vocabulary"** filter on the practice page:

- The system asks: "How many practice attempts have been made with vocabulary filter active?"
- Answer: **0** (because all attempts were made with NO filter)
- This is honest reporting - no mixing of filtered vs unfiltered attempts

When user selects **NO filters** (wildcard):

- The system shows: All 4 attempts (includes the category=NULL entries)
- Accuracy: 100%
- Box counts: 3 in Box 1, 1 in Box 2

## Future: When Category Filter is ACTUALLY Used

When a user makes a NEW practice attempt WITH category="vocabulary" filter:

1. Frontend sends: `filterCategory: "vocabulary"`
2. Backend captures: `recordPracticeAttempt(..., filterContext={category:"vocabulary"})`
3. Database stores: `category = 'vocabulary'` (not NULL)
4. Filter query then shows: That attempt counts toward "vocabulary accuracy"

## Code is Correct

The fix to [src/auth/practice.mjs](src/auth/practice.mjs) ensures:

```javascript
// If no filter context, use NULL (not the card's category)
cardCategory =
  filterContext?.category && filterContext.category !== '' ? filterContext.category : null; // ← NULL for unfiltered attempts
```

This way, category field represents "What filter was active when this attempt was made?" not "What category does the card have?"

## Summary

✅ **Wildcard filter works:** Shows all attempts  
✅ **Class filter works:** Shows all English attempts  
✅ **Category filter works correctly:** Shows 0 attempts (none made with this filter yet)  
✅ **No breaking changes:** All other tests pass  
✅ **Correct semantics:** Filters represent "when it was practiced" not "what it is"

---

**Status:** Ready for browser testing
**Next Step:** Make a new practice attempt WITH category="vocabulary" filter selected to see 1/1 recorded
