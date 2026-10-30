# 🔴 BUG REPORT: Category Filter Not Stored in Practice History

**Severity:** HIGH  
**Status:** CONFIRMED  
**Found:** 2026-10-30 00:34 EDT

## Problem Summary

When practice attempts are submitted with a category filter applied, the `category` column in `practice_history` table is **NOT being populated**. This breaks the accuracy calculation when filtering by category.

## Symptoms

1. **On UI:** When category filter is applied and accuracy is calculated, shows `0% (0/0 Correct)` instead of correct accuracy
2. **Database Query:** Practice attempts have `category=NULL` even though flashcards have correct category values
3. **Test Results:** Database filters work correctly for flashcards but filter doesn't match any practice attempts

## Test Data Evidence

**Flashcards (have correct data):**

```
flashcard_id: 2aaaeb51
class: 'English Connect'
lesson: 'Week 02'
category: 'vocabulary'  ✅
```

**Practice History (MISSING category):**

```
id: 187
flashcard_id: 2aaaeb51
class: 'English Connect'  ✅
lesson: 'Week 02'         ✅
category: NULL            ❌ SHOULD BE 'vocabulary'
correct: true
created_at: 2026-10-30 04:22:36
```

## Database Verification

### Query: All Practice Attempts for tmann

```sql
SELECT id, flashcard_id, class, lesson, category, correct, created_at
FROM practice_history
WHERE user_id = 'ce8b10de-d16c-49ba-bf2b-cfd3153763bd'
ORDER BY created_at;
```

**Result:**

| id  | class           | lesson  | category    | correct |
| --- | --------------- | ------- | ----------- | ------- |
| 187 | English Connect | Week 02 | **NULL** ❌ | t       |
| 188 | English Connect | Week 01 | **NULL** ❌ | t       |
| 189 | English Connect | Week 01 | **NULL** ❌ | t       |
| 190 | English Connect | Week 01 | **NULL** ❌ | t       |

### Query: Filter by Category (Shows Bug)

```sql
SELECT COUNT(*) as total_attempts, accuracy
FROM practice_history
WHERE user_id = 'ce8b10de-d16c-49ba-bf2b-cfd3153763bd'
  AND category ILIKE 'vocabulary%'
```

**Result:** 0 attempts (should be 4!)

### Query: Filter by Class (Works)

```sql
SELECT COUNT(*) as total_attempts, accuracy
FROM practice_history
WHERE user_id = 'ce8b10de-d16c-49ba-bf2b-cfd3153763bd'
  AND class ILIKE 'English%'
```

**Result:** 4 attempts ✅ (correct!)

## Root Cause Analysis

### Code Path Investigation

**Frontend:** (practice.ejs line 835)

```javascript
filterCategory: filters.category || null,  // ✅ Sends category correctly
```

Status: **OK** - Frontend IS sending filterCategory in request body

**Backend Route:** (practice.mjs line 296-299)

```javascript
const filterContext = {
  class: filterClass || null,
  lesson: filterLesson || null,
  category: filterCategory || null, // ✅ Receives from request
};
```

Status: **OK** - Route receives and passes to recordPracticeAttempt()

**Backend Function:** (practice.mjs line 462-485)

```javascript
export async function recordPracticeAttempt(
  userId,
  flashcardId,
  isCorrect,
  responseTimeMs = null,
  filterContext = null  // ✅ Receives filterContext
) {
  // Line 478: Uses filterContext.category if provided
  cardCategory = filterContext?.category || card.category;

  // Line 483: Inserts into practice_history with cardCategory
  INSERT INTO practice_history (..., category)
  VALUES (..., $7)  // cardCategory
}
```

Status: **APPEARS OK** - Code looks correct!

## Hypothesis

The code LOOKS correct, but the data shows category is NULL. Possible causes:

1. **These practice attempts were recorded BEFORE the category feature was implemented**
   - The attempts at 2026-10-30 04:22:36 might predate the category capture feature
   - New attempts may work correctly

2. **sessionStorage was empty when attempts were made**
   - If `sessionStorage.getItem('studyFilters')` returned null/empty
   - Then `filters` object would be `{}`
   - Then `filterCategory: filters.category || null` = `null`
   - Result: category saved as NULL

3. **Bug in how filterContext is passed**
   - Unlikely since class and lesson ARE being saved correctly

## Test Case: Reproduce With New Attempt

**Steps:**

1. Open Practice page
2. Set filters: Class="English Connect", Category="vocabulary"
3. Click "Apply Filters"
4. Make a practice attempt and answer correctly
5. Check database: Does practice_history.category = 'vocabulary'?

**Expected:** Category should be populated  
**Actual:** TBD (needs testing)

## Impact on Features

| Feature                           | Status    | Impact                              |
| --------------------------------- | --------- | ----------------------------------- |
| Wildcard filtering (no filters)   | ✅ WORKS  | Shows all cards correctly           |
| Class filtering                   | ✅ WORKS  | Accuracy is correct                 |
| Lesson filtering                  | ✅ WORKS  | Accuracy is correct                 |
| Category filtering                | ❌ BROKEN | Shows 0% instead of actual accuracy |
| Combined filters (class+category) | ❌ BROKEN | Category portion fails              |

## Solution Options

### Option A: Populate Missing Data (DATA FIX)

Update existing practice_history records by joining with flashcards:

```sql
UPDATE practice_history ph
SET category = f.category
FROM flashcards f
WHERE ph.flashcard_id = f.flashcard_id
  AND ph.category IS NULL;
```

**Pros:** Fixes existing data, retrospective accuracy correct  
**Cons:** Assumes category at time of practice = current category

### Option B: Debug and Fix New Attempts (CODE FIX)

1. Add logging to recordPracticeAttempt() to trace filterContext
2. Verify sessionStorage is populated on practice page
3. Test new practice attempt with category filter applied
4. Confirm category saves correctly

**Pros:** Fixes root cause for future attempts  
**Cons:** Doesn't fix existing historical data

### Option C: Both (COMPREHENSIVE FIX)

1. Fix code for new attempts
2. Migrate existing data to populate category from flashcards

**Pros:** Complete fix, all data correct going forward  
**Cons:** More complex

## Recommended Action

1. **IMMEDIATE:** Implement Option B debugging
   - Add server logs to show filterContext value in recordPracticeAttempt()
   - Make a test practice attempt with category filter
   - Verify category is now saved correctly

2. **FOLLOW-UP:** If new attempts work correctly, implement Option A
   - Backfill missing category data from flashcards table
   - Verify accuracy calculations now work for all filters

## Files to Review

- [src/auth/practice.mjs](src/auth/practice.mjs) - recordPracticeAttempt() function (line 462-510)
- [src/routes/practice.mjs](src/routes/practice.mjs) - POST /api/practice/answer endpoint (line 232-310)
- [src/views/practice.ejs](src/views/practice.ejs) - Frontend answer submission (line 820-840)
- [src/views/partials/filter-panel.ejs](src/views/partials/filter-panel.ejs) - Filter storage (line 240-275)

## Related Tests

- **Test 3:** CLASS="English*" + CATEGORY="vocabulary" shows 0% instead of 100%
- **Test 5:** CATEGORY="vocabulary" alone shows 0% instead of 100%

See: [FILTER_SCENARIOS_VERIFIED.md](./FILTER_SCENARIOS_VERIFIED.md)

---

## Status Updates

- [ ] Confirmed with new test practice attempt
- [ ] Fixed code to always capture category
- [ ] Backfilled missing practice_history.category values
- [ ] Re-tested all filter scenarios
- [ ] Verified accuracy now shows correctly for all filters
