# "None of the Above" Practice Mode Feature

## Overview

The FlashCards application now includes an intelligent "None of the above" option in practice mode that appears periodically to encourage critical thinking while maintaining focus on learning the correct answers.

## Design Philosophy

This feature implements a sophisticated learning strategy based on educational research:

1. **Primary Focus**: Students need to practice with the actual correct answer most of the time (~80-90%)
2. **Critical Thinking**: Occasionally (~10-20%) students get a "None of the above" challenge
3. **Analytical Skills**: This builds the ability to recognize when an answer doesn't match any option
4. **Retention**: The balance ensures students don't just memorize one right answer, but understand why other options are wrong

## How It Works

### Frequency Logic

The system tracks how many times each card has been shown with "None of the above" and automatically adjusts:

```
Total Attempts = times_correct + times_incorrect
None of Above Ratio = none_of_above_count / total_attempts

If Ratio < 15%: Show correct answer (standard mode)
If Ratio ≥ 15%: Show "None of the above" (critical thinking mode)
```

This ensures a roughly **85:15 ratio** of standard-to-challenge questions.

### Two Practice Modes

#### Mode 1: Standard Multiple Choice (85% of questions)

- Shows the correct answer along with 3 wrong answers from other flashcards
- User selects from the 4 options
- System validates their selection
- Visual feedback: Green for correct, Red for incorrect

#### Mode 2: None of the Above Challenge (15% of questions)

- Shows 4 distractors (wrong answers from other flashcards)
- Does NOT show the correct answer as an option
- "None of the above" appears as one of the 4 choices (as the correct option)
- User must recognize that none of the 4 answer options match the question
- When incorrect, the actual answer is revealed

### Examples

#### Standard Mode

```
Question: "What is the capital of France?"

Options:
A) London
B) Paris ✓ (Correct)
C) Berlin
D) Madrid
```

#### None of the Above Mode

```
Question: "What is the capital of France?"

Options:
A) London
B) Tokyo
C) Madrid
D) None of the above ✓ (Correct)

Feedback if wrong: "Correct answer: Paris"
```

## Database Changes

### New Column

Added `none_of_above_count` INTEGER DEFAULT 0 to the `flashcard_leitner_progress` table.

This tracks how many times each card has been shown with "None of the above" option.

### Schema

```sql
ALTER TABLE flashcard_leitner_progress
ADD COLUMN none_of_above_count INTEGER DEFAULT 0;
```

## Implementation Details

### Backend Logic

**File**: `src/scripts/js/modules/auth/practice.mjs`

The `generateMultipleChoiceOptions()` function now:

1. Queries the current progress for the card (none_of_above_count, times_correct, times_incorrect)
2. Calculates whether to show correct answer or "None of the above"
3. If standard mode: returns correct answer + 3 wrong answers
4. If challenge mode: returns 4 wrong answers + "None of the above" as correct

```javascript
export async function generateMultipleChoiceOptions(userId, correctCard, optionCount = 4) {
  // Get progress tracking data
  const progressResult = await query(
    `SELECT none_of_above_count, times_correct, times_incorrect 
     FROM flashcard_leitner_progress 
     WHERE flashcard_id = $1 AND user_id = $2`,
    [correctCard.flashcard_id, userId]
  );

  // Calculate ratio
  const noneOfAboveCount = progressResult.rows[0]?.none_of_above_count || 0;
  const totalAttempts =
    (progressResult.rows[0]?.times_correct || 0) + (progressResult.rows[0]?.times_incorrect || 0);
  const shouldShowCorrectAnswer = totalAttempts === 0 || noneOfAboveCount / totalAttempts < 0.15;

  // Generate options based on mode
  let options = [];
  if (shouldShowCorrectAnswer) {
    // Standard: correct + 3 wrong answers
    options.push({ text: correctCard.answer, isCorrect: true });
    // ... add wrong answers
  } else {
    // Challenge: 4 wrong answers + "None of the above"
    // ... add wrong answers
    options.push({ text: 'None of the above', isCorrect: true, isNoneOfAbove: true });
  }

  return options.sort(() => Math.random() - 0.5);
}
```

### API Updates

**File**: `src/scripts/js/modules/routes/practice.mjs`

#### GET /api/practice/next

- Returns `options` array with each option containing:
  - `text`: The option text (including "None of the above" when applicable)
  - `isCorrect`: Boolean indicating if this is the correct option
  - `isNoneOfAbove`: Boolean flag when this is "None of the above" option
- Returns `showingNoneOfAbove`: Boolean flag indicating if this is a challenge question
- Increments `none_of_above_count` when showing this mode

#### POST /api/practice/answer

- Accepts selected option index
- Backend regenerates options and validates selection
- Returns appropriate feedback
- Leitner box progression logic unchanged

### Frontend Updates

**File**: `src/views/practice.ejs`

#### Option Display

- Options are displayed as buttons in a 2x2 grid (or single column on mobile)
- "None of the above" appears as a regular option when in challenge mode
- Visual styling is identical to other options

#### Feedback Handling

Enhanced feedback for "None of the above" scenarios:

```javascript
// If user got it wrong and "None of the above" was correct,
// display the actual correct answer in the feedback
if (!data.isCorrect && currentOptions[optionIndex].text !== 'None of the above') {
  const noneOfAboveOption = currentOptions.find((o) => o.isNoneOfAbove === true);
  if (noneOfAboveOption) {
    feedbackText += ` (Correct answer: ${currentCard.answer})`;
  }
}
```

## User Experience Flow

### Typical Practice Session

1. User clicks "Practice" or "Start Practicing"
2. First card loads (likely in standard mode since it's the first attempt)
3. User selects an option
4. System validates and shows feedback:
   - **Correct**: Green highlight on selection, "Correct! ✓" message
   - **Incorrect**: Red highlight on selection, green highlight on correct answer, "Incorrect. The answer was..." message
5. User clicks "Next Card"
6. After ~6-7 questions in standard mode, might get a challenge question
7. User selects "None of the above"
8. Feedback shows: "Correct! ✓"
9. Leitner box progression continues

### Statistics Tracking

The feature integrates seamlessly with existing Leitner system:

- Correct/incorrect counts still drive box progression
- "None of the above" selections are counted as correct/incorrect answers
- Practice history includes all attempts regardless of mode
- Statistics dashboard shows overall performance

## Pedagogical Benefits

1. **Spaced Repetition**: Primary learning goal remains the correct answer
2. **Critical Analysis**: Forces students to evaluate wrong answers carefully
3. **Discrimination Training**: Teaches students what the answer is NOT
4. **Transfer Learning**: Students learn to recognize correct answers even when presented differently
5. **Anti-Pattern Prevention**: Prevents students from pattern-matching to specific distractors

## Configuration

Current hardcoded settings:

- **Target Ratio**: 15% challenge questions (85% standard)
- **Option Count**: Always 4 options
- **Challenge Frequency**: Calculated per-card based on usage

### To Adjust

Edit `src/scripts/js/modules/auth/practice.mjs` line in `generateMultipleChoiceOptions()`:

```javascript
// Current: target 15% challenge questions
const shouldShowCorrectAnswer = totalAttempts === 0 || noneOfAboveCount / totalAttempts < 0.15;

// To increase challenges to 20%:
const shouldShowCorrectAnswer = totalAttempts === 0 || noneOfAboveCount / totalAttempts < 0.2;

// To decrease challenges to 10%:
const shouldShowCorrectAnswer = totalAttempts === 0 || noneOfAboveCount / totalAttempts < 0.1;
```

## Migration

New migration added: `add_none_of_above_tracking`

Automatically:

- Creates `none_of_above_count` column if it doesn't exist
- Initializes to 0 for existing cards
- Runs on server startup (idempotent)

No user action required - existing data is preserved.

## Testing Checklist

To verify the feature works:

1. **Login and Start Practicing**
   - Navigate to Practice page
   - Start practicing with some flashcards

2. **Verify Initial Standard Mode**
   - First several cards should show the correct answer
   - Should see 3 wrong answers as distractors
   - Feedback should work normally

3. **Trigger Challenge Mode**
   - Answer the same card 6-7 times correctly
   - On subsequent attempts, watch for "None of the above" option
   - Should appear as a regular option (shuffled in position)

4. **Test Challenge Mode Feedback**
   - If you select a wrong answer in challenge mode
   - Feedback should show: "Incorrect" + actual correct answer revealed
   - If you select "None of the above"
   - Feedback should show: "Correct! ✓"

5. **Box Progression**
   - Correct answers (including "None of the above" selections) move card up boxes
   - Incorrect answers move card back to Box 1
   - Overall statistics still track correctly

6. **Multiple Users**
   - Each user should have independent tracking
   - Ratios calculated per-user, not globally

## Performance Considerations

- **Database Query**: One additional query per practice round to check `none_of_above_count`
- **Calculation**: Simple ratio calculation (~0.1ms)
- **Memory**: One additional integer field per card per user
- **Scaling**: Linear with number of cards × users (same as existing progress tracking)

## Future Enhancements

1. **Adjustable Ratios**: Admin setting to change challenge frequency
2. **Per-Card Difficulty**: Different ratios for easy vs hard cards
3. **Temporal Patterns**: Increase challenges for well-learned cards, decrease for struggling cards
4. **Analytics**: Dashboard showing challenge mode performance
5. **Confidence Levels**: Add confidence rating alongside correctness
6. **Custom Distractors**: Allow teachers to specify intentional wrong answers

## Migration History

- **v1.0** (Current): Basic "None of the above" with 15% frequency targeting
- Builds on Leitner system (v0.9)
- Builds on Multiple Choice Mode (v0.8)

## References

- Leitner System: https://en.wikipedia.org/wiki/Leitner_system
- Spaced Repetition: https://en.wikipedia.org/wiki/Spaced_repetition
- Item Response Theory: Educational research on multiple choice effectiveness
- Bloom's Taxonomy: Cognitive levels including analysis and evaluation
