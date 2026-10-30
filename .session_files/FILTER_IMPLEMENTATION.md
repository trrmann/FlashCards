# Practice Filtering Implementation

## Overview
The practice module now supports **dynamic filtering by Class, Category, and Lesson** with wildcard support. All filtering is completely data-driven and works with any user-created card values.

## Features

### 1. Main Practice Cards - Limited to Selected Header (with Wildcards)
- **What**: Main practice cards are filtered to match user's selected Class/Category/Lesson
- **How**: Cards are pulled from `getDueCardsForToday(userId, filters)`
- **Wildcards**: User can type `Bio*` to match "Biology", "Biosphere", etc.
- **Example Filters**:
  - `class: "English Connect"` - exact match
  - `class: "English*"` - matches "English Connect", "English Advanced", etc.
  - `category: "vocabulary"` - exact match
  - `category: "vocab*"` - matches "vocabulary", "vocab-practice", etc.

### 2. Wrong Answers (Distractors) - Match Class AND Category (Any Lesson)
- **What**: Wrong answers come from cards with same Class AND Category
- **Why**: Keeps distractors relevant to the topic, but pulls from different lessons for variety
- **Mechanism**: `generateMultipleChoiceOptions()` filters distractors using:
  ```sql
  AND class = correctCard.class
  AND category = correctCard.category
  AND flashcard_id != correctCard.flashcard_id  -- Different card
  AND lesson != correctCard.lesson              -- Can be different lesson
  ```
- **Example**: Practicing "Biology 101" / "Photosynthesis" lesson gets wrong answers from other "Biology 101" / "Photosynthesis" cards OR other lessons in that class/category

## How It's Used

### Frontend Flow
1. User selects filters on Entries page (preserved in sessionStorage)
2. User navigates to Practice page
3. Practice page reads sessionStorage for active filters
4. Each time `loadNextCard()` is called, it includes filters in query parameters:
   ```
   /api/practice/next?class=Biology101&category=photosynthesis
   ```

### Backend Flow
1. Route receives filters in query params
2. Calls `getDueCardsForToday(userId, { class, lesson, category })`
3. Filters applied using parameterized queries (SQL injection safe)
4. Random card selected from filtered set
5. Distractors generated from same class/category (via `generateMultipleChoiceOptions()`)
6. Card + options returned to frontend

## SQL Implementation

### Dynamic Filter Conversion
```javascript
// getFilterPattern() - converts user input to SQL LIKE pattern
function getFilterPattern(filterValue) {
  if (!filterValue || filterValue.trim() === '') return null;
  const trimmed = filterValue.trim();
  if (trimmed.endsWith('*')) {
    return trimmed.substring(0, trimmed.length - 1) + '%'; // "Bio*" → "Bio%"
  }
  return trimmed; // No wildcard → exact match
}
```

### Parameterized Query Building
```javascript
// Build WHERE clause dynamically based on provided filters
let filterConditions = [];
let queryParams = [userId];
let paramIndex = 2;

if (classPattern) {
  filterConditions.push(`f.class ILIKE $${paramIndex++}`);
  queryParams.push(classPattern);
}

if (lessonPattern) {
  filterConditions.push(`f.lesson ILIKE $${paramIndex++}`);
  queryParams.push(lessonPattern);
}

if (categoryPattern) {
  filterConditions.push(`f.category ILIKE $${paramIndex++}`);
  queryParams.push(categoryPattern);
}

const filterClause = filterConditions.length > 0 
  ? 'AND ' + filterConditions.join(' AND ') 
  : '';
```

## Data Compatibility

- **No Hard-Coded Values**: All filters are user-data-driven
- **Works with Any Class Names**: "Biology 101", "French Class", "Piano Basics", "Custom Topic"
- **Works with Any Category Names**: "vocabulary", "grammar", "listening", "verbs", "custom-tag"
- **Works with Any Lesson Names**: "Week 01", "Chapter 5", "Module 3", "Advanced Topics"

## Examples

### Scenario 1: Basic Class Filtering
```
User has cards:
- Class: "Spanish 101", Category: "verbs", Lesson: "Past Tense"
- Class: "Spanish 101", Category: "verbs", Lesson: "Present Tense"
- Class: "Spanish 101", Category: "nouns", Lesson: "Objects"

User filters by: class="Spanish 101", category="verbs"
Result: Gets random card from Past Tense or Present Tense lessons
Distractors: Wrong answers from other "Spanish 101"/"verbs" cards
```

### Scenario 2: Wildcard Filtering
```
User has cards:
- Class: "Biology 101", Category: "cells"
- Class: "Biology 102", Category: "cells"
- Class: "Chemistry 101", Category: "molecules"

User filters by: class="Biology*"
Result: Gets cards from "Biology 101" OR "Biology 102"
```

### Scenario 3: Multi-Filter
```
User filters by: class="English Connect", category="vocabulary", lesson="Week 01"
Result: Only cards matching ALL three criteria
Distractors: Wrong answers from same class/category (any lesson)
```

## API Endpoints

### GET /api/practice/next
Fetch next practice card with filtering support

**Query Parameters:**
- `catchUp` (optional): `true` for catch-up mode (any card), `false` for due cards only
- `class` (optional): Class name or wildcard pattern (e.g., "Biology*")
- `lesson` (optional): Lesson name or wildcard pattern
- `category` (optional): Category name or wildcard pattern

**Example:**
```
GET /api/practice/next?class=Spanish%20101&category=verbs
GET /api/practice/next?class=Bio*&catchUp=true
GET /api/practice/next  (no filters)
```

## Database Columns Used

The implementation uses these columns for filtering:
- `flashcards.class` - VARCHAR(255) - Class/subject name
- `flashcards.category` - VARCHAR(255) - NEW COLUMN (added via migration)
- `flashcards.lesson` - VARCHAR(255) - Lesson/chapter name

The `category` column is automatically added by the migration:
```javascript
ALTER TABLE flashcards ADD COLUMN category VARCHAR(255)
```

## Safety & Performance

- **SQL Injection Safe**: All filter values use parameterized queries
- **Efficient**: Filters applied at database level, not in application
- **Indexed**: Key filter columns (class, category, lesson) should ideally have indexes for large datasets
- **Null-Safe**: NULL values in filter columns are handled gracefully

## Future Enhancements

1. **Add database indexes** on (class, category, lesson) columns for performance
2. **Implement difficulty-aware filtering** - prioritize harder cards
3. **Support multiple category selection** - filter by multiple categories at once
4. **Saved filter presets** - users can save common filter combinations
5. **Filter statistics** - show how many cards match current filters
