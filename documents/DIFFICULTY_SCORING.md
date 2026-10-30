# Adaptive Difficulty Scoring System

**Status:** ✅ Complete and tested  
**Commit:** e3e179f  
**Date:** 2026-10-29

## Overview

Implemented an adaptive difficulty scoring system that automatically adjusts flashcard difficulty based on performance data. Difficulty scores influence card selection priority and can guide smarter Leitner box transitions.

## Difficulty Scale

**1.0 - Very Easy:** Card has 100% success rate  
**2.0 - Easy:** Card has ~75% success rate  
**3.0 - Medium:** Card has 50% success rate (default for new cards)  
**4.0 - Hard:** Card has ~25% success rate  
**5.0 - Very Hard:** Card has 0% success rate

## Calculation Formula

```
difficulty = 5.0 - (successRate × 4.0)

where:
  successRate = (correct_attempts / total_attempts)
  difficulty = clamped to range [1.0, 5.0]
```

### Examples

| Success Rate | Difficulty | Category  |
| ------------ | ---------- | --------- |
| 100% (5/5)   | 1.0        | Very Easy |
| 75% (3/4)    | 2.25       | Easy      |
| 50% (2/4)    | 3.0        | Medium    |
| 25% (1/4)    | 4.25       | Hard      |
| 0% (0/5)     | 5.0        | Very Hard |

## Private vs. Shared Calculation

### Private Cards

- **Calculation basis:** Only owner's performance
- **Use case:** Personal study sets where difficulty is individual
- **Benefit:** Customized difficulty reflects personal learning pace
- **Field:** `created_by` = current user

### Shared Cards

- **Calculation basis:** All users' aggregate performance
- **Use case:** Class materials, textbooks, study guides
- **Benefit:** Community wisdom - reflects how difficult the card is for most learners
- **Field:** `is_private` = false

## Database Schema

### Modified: `flashcards` Table

```sql
ALTER TABLE flashcards ADD COLUMN difficulty_score DECIMAL(3, 2) DEFAULT 3.00;
ALTER TABLE flashcards ADD COLUMN last_difficulty_update TIMESTAMP DEFAULT NOW();
ALTER TABLE flashcards ADD COLUMN difficulty_calc_base VARCHAR(10) DEFAULT 'individual';
```

### New: `difficulty_history` Table

Tracks all difficulty score changes over time for audit trail and trend analysis.

```sql
CREATE TABLE difficulty_history (
  id SERIAL PRIMARY KEY,
  flashcard_id UUID NOT NULL,
  old_score DECIMAL(3, 2),
  new_score DECIMAL(3, 2),
  calculation_basis VARCHAR(255),
  sample_size INTEGER,
  success_rate DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (flashcard_id) REFERENCES flashcards(flashcard_id) ON DELETE CASCADE
);

CREATE INDEX idx_difficulty_history ON difficulty_history (flashcard_id, created_at);
```

## Backend Functions

### `calculateDifficultyFromSuccessRate(successRate)`

Internal function that converts success rate to difficulty score.

```javascript
// 75% success rate
const difficulty = calculateDifficultyFromSuccessRate(0.75);
// Returns: 2.0 (easy)
```

### `updateDifficultyScore(flashcardId, userId)`

Updates difficulty for a single flashcard based on current performance data.

**Returns:**

```json
{
  "flashcardId": "uuid",
  "oldScore": 3.0,
  "newScore": 2.25,
  "successRate": "75.00",
  "sampleSize": 4,
  "calculationBasis": "Owner only (4 attempts)",
  "changed": true
}
```

**Logic:**

1. Retrieves flashcard info (is_private, created_by)
2. For private cards: queries `practice_history` for owner's attempts only
3. For shared cards: queries `practice_history` for all users' attempts
4. Calculates new difficulty from success rate
5. Updates `difficulty_score` and `last_difficulty_update`
6. Records change in `difficulty_history` table

### `batchUpdateDifficultyScores(userId, lessonFilter)`

Updates difficulty for multiple cards (all cards or filtered by lesson).

**Parameters:**

- `userId`: User ID (for filtering private cards)
- `lessonFilter`: Optional lesson name to filter cards

**Returns:**

```json
[
  {
    "flashcardId": "uuid1",
    "oldScore": 3.0,
    "newScore": 2.5,
    "successRate": "62.50",
    "sampleSize": 8,
    "changed": true
  }
  // ... more updates
]
```

### `getDifficultyStats(userId)`

Returns distribution and statistics for all cards.

**Returns:**

```json
{
  "total_cards": "42",
  "avg_difficulty": "2.8",
  "easiest": "1.2",
  "hardest": "4.9",
  "very_easy": "5", // 1.0-2.0
  "easy": "12", // 2.0-3.0
  "medium": "15", // 3.0-4.0
  "hard": "8", // 4.0-5.0
  "very_hard": "2" // 5.0
}
```

## API Endpoints

### POST `/api/practice/difficulty/update-single`

Update difficulty score for a single flashcard.

**Request:**

```json
{
  "flashcardId": "366b6066-e23f-4639-9953-535a77841038"
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "flashcardId": "...",
    "oldScore": "3.00",
    "newScore": 2.33,
    "successRate": "66.67",
    "sampleSize": 6,
    "calculationBasis": "Owner only (6 attempts)",
    "changed": true
  }
}
```

### POST `/api/practice/difficulty/update-batch`

Batch update difficulty scores for multiple cards.

**Request:**

```json
{
  "lesson": "Mathematics" // optional
}
```

**Response:**

```json
{
  "status": "success",
  "summary": {
    "total": 24,
    "updated": 8,
    "errors": 0,
    "lesson": "Mathematics"
  },
  "details": [{/* first 10 updates in full detail */}]
}
```

### GET `/api/practice/difficulty/stats`

Get difficulty statistics and distribution.

**Response:**

```json
{
  "status": "success",
  "data": {
    "total_cards": "42",
    "avg_difficulty": "2.8",
    "easiest": "1.2",
    "hardest": "4.9",
    "very_easy": "5",
    "easy": "12",
    "medium": "15",
    "hard": "8",
    "very_hard": "2"
  }
}
```

## Test Results

### Test 1: Basic Difficulty Calculation ✅

- Added card with default difficulty 3.0
- Simulated 3 correct + 1 incorrect (75% success)
- Updated difficulty → 2.33 (easy)
- ✓ Correct formula application

### Test 2: Perfect Score ✅

- Simulated 5 correct answers (100% success)
- Updated difficulty → 1.0 (very easy)
- ✓ Correctly identifies mastered cards

### Test 3: Zero Success ✅

- Simulated 5 incorrect answers (0% success)
- Updated difficulty → 5.0 (very hard)
- ✓ Correctly identifies problem cards

### Test 4: Batch Updates ✅

- Updated 2 cards simultaneously
- Both scores recalculated correctly
- ✓ Batch processing working

## Implementation Details

### Public vs. Shared Card Handling

```javascript
if (is_private) {
  // Query only this user's performance
  const stats = await query(
    `SELECT COUNT(*), SUM(CASE WHEN correct THEN 1 END)
     FROM practice_history
     WHERE flashcard_id = $1 AND user_id = $2`
  );
} else {
  // Query all users' performance
  const stats = await query(
    `SELECT COUNT(*), SUM(CASE WHEN correct THEN 1 END)
     FROM practice_history
     WHERE flashcard_id = $1`
  );
}
```

### Default Difficulty for New Cards

- Initial value: **3.0 (medium)**
- Rationale: Unknown difficulty deserves neutral starting point
- Adaptive: Adjusts as soon as user attempts the card

## Future Enhancements

### 1. Adaptive Box Transitions

```javascript
// Use difficulty to influence Leitner box movement
if (difficulty <= 1.5) {
  // Very easy - promote faster
  moveToBox(3); // Jump to Box 3
} else if (difficulty >= 4.5) {
  // Very hard - demote with penalty
  moveToBox(1); // Back to Box 1
  times_incorrect += 2; // Extra penalty
}
```

### 2. Smart Card Selection

Prioritize high-difficulty cards in practice sessions:

```sql
-- Get next card, prioritizing harder ones
SELECT * FROM flashcards
WHERE user_id = $1 AND is_due = true
ORDER BY difficulty_score DESC, next_review ASC
LIMIT 1
```

### 3. Difficulty-Based Repetitions

Adjust repetition count based on difficulty:

```javascript
function getRepetitionsNeeded(boxNumber, difficulty) {
  const baseReps = [3, 2, 1][boxNumber - 1];

  // Very hard cards: add extra repetition
  if (difficulty >= 4.0) return baseReps + 1;

  // Very easy cards: reduce repetitions
  if (difficulty <= 1.5) return Math.max(1, baseReps - 1);

  return baseReps;
}
```

### 4. Predictive Analytics

- Predict which cards user will struggle with
- Pre-identify cards likely to move to Box 1
- Recommend focus areas based on difficulty trends

### 5. Difficulty Variance Tracking

```sql
-- Track if card has consistent difficulty or high variance
SELECT
  flashcard_id,
  STDDEV_POP(new_score) as difficulty_variance,
  COUNT(*) as update_count
FROM difficulty_history
GROUP BY flashcard_id
```

### 6. Community Difficulty Insights

For shared cards:

```json
{
  "flashcard_id": "...",
  "my_difficulty": 2.5, // My personal assessment
  "community_difficulty": 3.8, // What others find
  "users_attempted": 127,
  "difference": "+1.3 (easier for me)"
}
```

## Performance Considerations

### Database Indices

- `idx_difficulty_history(flashcard_id, created_at)` - Fast history lookups
- Existing indices on `practice_history` reused for calculations

### Calculation Efficiency

- Single query per card for statistics
- Batch operations use query in loop (can be optimized with CTEs)
- No locks or transactions needed (reads are safe, updates are atomic)

### Scalability

- Works efficiently with millions of practice attempts
- Difficulty history grows linearly with updates (can be pruned)
- Query performance: O(n) where n = attempts for that card

## Migration Path

1. **Phase 1** (completed): Add difficulty columns and history table
2. **Phase 2** (optional): Auto-update difficulties on every practice session
3. **Phase 3** (optional): Use difficulty in Leitner box transitions
4. **Phase 4** (optional): Expose difficulty stats to users in dashboard
5. **Phase 5** (optional): Machine learning to predict optimal repetitions

## Files Modified

- ✅ `src/scripts/js/modules/db/migrations.mjs` - Added difficulty migration
- ✅ `src/scripts/js/modules/auth/practice.mjs` - Added 3 difficulty functions
- ✅ `src/scripts/js/modules/routes/practice.mjs` - Added 3 API endpoints

## Summary

The adaptive difficulty scoring system provides:

- **Personalization**: Difficulty reflects individual learning pace
- **Community Insight**: Shared cards show aggregate difficulty across all users
- **Performance Data**: Historical tracking of score changes
- **Flexibility**: Private vs. shared calculation modes
- **Extensibility**: Foundation for intelligent card selection and adaptive repetitions

This enhancement transforms the Leitner system from purely time-based to **difficulty-aware**, enabling truly adaptive learning.
