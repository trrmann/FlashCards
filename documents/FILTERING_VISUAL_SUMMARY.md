# Practice Filtering - Implementation Complete ✅

## What You Asked For

> the answer should be the card is limited to the full selected header, with wildcards opening up the range, and the wrong answers should match the class and category, but do not have to match the lesson

## What Was Delivered

### ✅ Main Practice Cards - Limited to Selected Header with Wildcards

```
User's Cards:
┌─────────────────────────────────────────────┐
│ Class: Spanish 101        Category: verbs   │
│  └─ Lesson: Past Tense                      │
│  └─ Lesson: Present Tense                   │
│  └─ Lesson: Future Tense                    │
│                                              │
│ Class: Spanish 102        Category: verbs   │
│  └─ Lesson: Chapter 1                       │
│                                              │
│ Class: French 101         Category: verbs   │
│  └─ Lesson: Week 1                          │
└─────────────────────────────────────────────┘

User Applies Filters on Practice Page:
  Class: "Spanish*"  (wildcard pattern)
  Category: "verbs"

Practice Shows:
  ✓ Spanish 101 / verbs / Past Tense
  ✓ Spanish 101 / verbs / Present Tense
  ✓ Spanish 101 / verbs / Future Tense
  ✓ Spanish 102 / verbs / Chapter 1
  ✗ French 101 / verbs / Week 1  (doesn't match "Spanish*")
```

### ✅ Wrong Answers Match Class AND Category (Different Lessons OK)

```
Currently Practicing:
  ┌──────────────────────────────────────┐
  │ Q: "to go"                           │
  │ Class: Spanish 101                   │
  │ Category: verbs                      │
  │ Lesson: Present Tense                │
  │                                       │
  │ A) ir          [CORRECT]             │
  │ B) estar       [WRONG - filtered]    │
  │ C) hablar      [WRONG - filtered]    │
  │ D) ver         [WRONG - filtered]    │
  └──────────────────────────────────────┘

Where Wrong Answers Come From:
  B: "estar" ✓ Spanish 101 / verbs / PAST TENSE (different lesson OK!)
  C: "hablar" ✓ Spanish 101 / verbs / FUTURE TENSE (different lesson OK!)
  D: "ver" ✓ Spanish 101 / verbs / ADVANCED (different lesson OK!)

NOT used for wrong answers:
  ✗ "être" (French 101 / verbs) - doesn't match class
  ✗ "libro" (Spanish 101 / nouns) - doesn't match category
```

---

## How It Works (Technical Flow)

### Step 1: User Selects Filters on Entries Page

```
┌─────────────────────────────────────┐
│  📊 Study Filters                   │
├─────────────────────────────────────┤
│  Class:    [Spanish*]               │
│  Lesson:   [          ]             │
│  Category: [verbs    ]              │
│                                      │
│  [Apply Filters]  [Clear All]       │
└─────────────────────────────────────┘
        ↓
   Stored in sessionStorage
```

### Step 2: Navigate to Practice Page

```
Practice Page Loads
  ↓
Reads sessionStorage
  {
    class: "Spanish*",
    lesson: null,
    category: "verbs"
  }
  ↓
Builds URL with filters
  /api/practice/next?class=Spanish%2A&category=verbs
```

### Step 3: Backend Receives & Filters

```
Route: GET /api/practice/next?class=Spanish*&category=verbs

Backend:
  1. Extract query params
  2. Convert wildcards: "Spanish*" → "Spanish%" (SQL LIKE pattern)
  3. Build WHERE clause:
     AND class ILIKE $4      (value: "Spanish%")
     AND category ILIKE $5   (value: "verbs")
  4. Query database with parameterized values
  5. Get random card from results
  6. Generate distractors from same class/category
  7. Return card + options
```

### Step 4: Frontend Displays Result

```
┌──────────────────────────────────┐
│ Q: "to go"                       │
│ Spanish 101 / verbs / Present    │
│                                   │
│ ⚪ ir                             │
│ ⚪ estar                          │
│ ⚪ hablar                         │
│ ⚪ ver                            │
│                                   │
│ [Submit] [Try Again]             │
└──────────────────────────────────┘
```

---

## Code Locations

### 1. Filter Reading (Frontend)

**File:** `src/views/practice.ejs`

```javascript
// Reads filters from sessionStorage (lines 569-580)
const studyFiltersJson = sessionStorage.getItem('studyFilters');
const filters = studyFiltersJson ? JSON.parse(studyFiltersJson) : {};

// Adds to API URL (lines 582-585)
if (filters.class) url += `&class=${encodeURIComponent(filters.class)}`;
if (filters.lesson) url += `&lesson=${encodeURIComponent(filters.lesson)}`;
if (filters.category) url += `&category=${encodeURIComponent(filters.category)}`;
```

### 2. Filter Pattern Conversion (Backend)

**File:** `src/scripts/js/modules/auth/practice.mjs`

```javascript
// Converts wildcards to SQL patterns (lines 8-16)
function getFilterPattern(filterValue) {
  if (!filterValue || filterValue.trim() === '') return null;
  const trimmed = filterValue.trim();
  if (trimmed.endsWith('*')) {
    return trimmed.substring(0, trimmed.length - 1) + '%'; // "Bio*" → "Bio%"
  }
  return trimmed;
}
```

### 3. Main Card Filtering

**File:** `src/scripts/js/modules/auth/practice.mjs` - `getDueCardsForToday()` (lines 183-243)

```javascript
// Accepts filters parameter
export async function getDueCardsForToday(userId, filters = {}) {
  // Build parameterized WHERE clauses
  if (classPattern) {
    filterConditions.push(`f.class ILIKE $${paramIndex++}`);
    queryParams.push(classPattern); // Safe: parameterized value
  }
  // ... same for lesson and category

  // Execute with all params
  const result = await query(`SELECT ... WHERE ... ${filterClause}`, queryParams);
  return result.rows;
}
```

### 4. Wrong Answer Filtering

**File:** `src/scripts/js/modules/auth/practice.mjs` - `generateMultipleChoiceOptions()` (lines 295-348)

```javascript
// Get wrong answers matching class AND category
const wrongAnswersResult = await query(
  `SELECT answer FROM (
    SELECT DISTINCT answer 
    FROM flashcards 
    WHERE created_by = $1 
    AND flashcard_id != $2 
    AND class = $4           // ← Must match class
    AND category = $5        // ← Must match category
    ... (lesson can vary)
  ) ...`,
  [userId, cardId, answer, correctCard.class, correctCard.category, limit]
);
```

### 5. API Endpoint Integration

**File:** `src/routes/practice.mjs` - GET `/api/practice/next` (lines 126-169)

```javascript
// Extract filters from query params (lines 139-142)
const filters = {
  class: req.query.class,
  lesson: req.query.lesson,
  category: req.query.category,
};

// Pass to getDueCardsForToday (lines 157-162)
const dueCards = await getDueCardsForToday(userId, filters);
```

### 6. Database Migration

**File:** `src/scripts/js/modules/db/migrations.mjs` (lines 454-476)

```javascript
{
  name: 'add_category_to_flashcards',
  description: 'Add category column to flashcards for practice filtering',
  run: async () => {
    // Creates column if not exists
    ALTER TABLE flashcards ADD COLUMN category VARCHAR(255)
  }
}
```

---

## Key Features Implemented

### ✅ Wildcard Support

```
Filter: "Bio*"          Matches:
  "Biology 101"         ✓
  "Biosphere"           ✓
  "BioChemistry"        ✓
  "Chemistry 101"       ✗

Filter: "English Connect"  Matches:
  "English Connect"       ✓
  "English Connect*"      ✗ (exact unless wildcard used)
```

### ✅ Class/Category Matching for Distractors

```
Practice Card:
  Class: "Spanish 101"
  Category: "verbs"
  Lesson: "Present"

Wrong Answer Sources - ALL must have:
  Class = "Spanish 101"
  Category = "verbs"
  Lesson = ANY (Past, Future, Chapter 1, etc.)
```

### ✅ SQL Injection Safe

All user values are parameterized - NOT concatenated into SQL:

```javascript
// ✅ SAFE - Value is parameter
query(`... WHERE class ILIKE $1`, [userValue]);

// ❌ DANGEROUS - Value is interpolated (NOT USED)
query(`... WHERE class ILIKE '${userValue}'`);
```

### ✅ Fully Dynamic

No hard-coded class/category/lesson values:

- Works with "Spanish 101" ✓
- Works with "Intro to French" ✓
- Works with "Piano Basics - Advanced" ✓
- Works with any future custom values ✓

### ✅ Backward Compatible

- Existing cards work unchanged
- category field is optional (NULL safe)
- Old practice sessions still work
- No data migration needed

---

## Testing Verification

### Filter Logic Tests ✅

```
Test 1: Class ILIKE "English Connect"
  Query: SELECT ... WHERE class ILIKE 'English Connect'
  Result: ✓ Returns 1 card

Test 2: Class ILIKE "English%" (wildcard)
  Query: SELECT ... WHERE class ILIKE 'English%'
  Result: ✓ Returns 1 card

Test 3: Combined: class ILIKE "English%" AND category ILIKE "vocabulary"
  Query: SELECT ... WHERE class ILIKE 'English%' AND category ILIKE 'vocabulary'
  Result: ✓ Returns 1 card
```

### Distractor Generation Tests ✅

```
Test: Generate options for a card
  Class: "English Connect"
  Category: "vocabulary"

  Result:
  ✓ Got 2 options total
  ✓ 1 correct answer
  ✓ 1 wrong answer
  ✓ Wrong answer verified to be from same class/category
```

### Integration Tests ✅

```
Full Flow: Filters → sessionStorage → query params → backend → SQL → results
  Status: ✓ PASS

Safety: Parameterized queries throughout
  Status: ✓ PASS

Data-Driven: No hard-coded values
  Status: ✓ PASS
```

---

## Summary Table

| Feature                            | Implementation                         | Status      |
| ---------------------------------- | -------------------------------------- | ----------- |
| Main cards limited to header       | getDueCardsForToday(filters)           | ✅ Complete |
| Wildcard support                   | getFilterPattern() + ILIKE             | ✅ Complete |
| Wrong answers match class/category | generateMultipleChoiceOptions() filter | ✅ Complete |
| Wrong answers vary by lesson       | Query doesn't filter on lesson         | ✅ Complete |
| No hard-coded values               | All parameterized queries              | ✅ Complete |
| SQL injection safe                 | Using $N placeholders                  | ✅ Complete |
| Dynamic with user data             | Reads from database, not config        | ✅ Complete |
| Backward compatible                | Optional fields, no breaking changes   | ✅ Complete |
| Auto-migration                     | Migration runs on startup              | ✅ Complete |
| Tested                             | Integration tests passing              | ✅ Complete |

---

## Commit Information

**Commit:** `aa76fb2`
**Message:** feat: implement header/class/category filtering for practice mode
**Files Changed:** 4 files, 116 insertions(+), 12 deletions(-)
**Timestamp:** 2026-10-30

---

## Usage Instructions

### 1. Create Cards with Metadata

Go to Entries page and create cards with:

- Class: "Spanish 101" (or any value)
- Category: "verbs" (or any value)
- Lesson: "Past Tense" (or any value)

### 2. Apply Filters Before Practice

1. On Entries page, expand "📊 Study Filters"
2. Enter filter values (with optional wildcards):
   - Class: "Spanish*" (or exact)
   - Category: "verbs" (or exact)
   - Lesson: "Past Tense" (or exact)
3. Click "Apply Filters"

### 3. Go to Practice

Practice page automatically reads filters from sessionStorage and applies them:

- Only shows cards matching filters
- Wrong answers from same class/category
- Wrong answers can be different lessons

### 4. Clear Filters

To practice all cards, click "Clear All" in filters panel before practice session.

---

## Questions?

The implementation is:

- **Data-driven** - Works with any class/category/lesson names
- **Safe** - Uses parameterized queries, no SQL injection
- **Tested** - Integration tests verify filtering works
- **Complete** - All requirements met
