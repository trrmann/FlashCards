# Diagnostic Information for Insufficient Entries

## Feature

When there aren't enough flashcards to create multiple choice options, users now receive detailed diagnostic information in a collapsible section showing exactly what type of entries are missing.

## How It Works

### Backend Changes

1. **Updated `generateMultipleChoiceOptions()`** ([src/scripts/js/modules/auth/practice.mjs](file:///home/tmann/Documents/Projects/FlashCards/src/scripts/js/modules/auth/practice.mjs:428))
   - Now returns an object instead of null when insufficient options
   - Object contains `insufficientOptions: true` flag
   - Includes `diagnostic` object with detailed information

2. **Diagnostic Object Structure**

   ```javascript
   {
     insufficientOptions: true,
     diagnostic: {
       currentCard: {
         question: "...",
         class: "Biology",
         category: "Cells",
         lesson: "Chapter 3"
       },
       availableWrongAnswers: 1,
       neededWrongAnswers: 2,
       totalOptionsNeeded: 4,
       message: "Add at least 2 more flashcards with Class: 'Biology' and Category: 'Cells' to create proper multiple choice options."
     }
   }
   ```

3. **API Endpoint** ([src/routes/practice.mjs](file:///home/tmann/Documents/Projects/FlashCards/src/routes/practice.mjs:178))
   - Checks if `options.insufficientOptions` is true
   - Passes `diagnostic` object to frontend in response

### Frontend Changes

1. **Collapsible Details Section** ([src/views/practice.ejs](file:///home/tmann/Documents/Projects/FlashCards/src/views/practice.ejs:667))
   - Uses HTML `<details>` element for collapsible interface
   - Default state: collapsed (user can click to expand)
   - Shows summary: "📋 What entries are missing?"

2. **Diagnostic Display Content**
   - Current card question text
   - Class value
   - Category value
   - Lesson value
   - Number of available wrong answers
   - Number of additional wrong answers needed
   - Specific recommendation message

## User Experience

### Scenario

1. User tries to practice with Biology/Cells flashcard
2. System finds only 1 other Biology/Cells card (need 3 more for 4-option multiple choice)
3. Message appears: "📝 More Entries Needed"
4. User sees collapsible section: "📋 What entries are missing?"
5. User clicks to expand and reads:
   - Current Card: "What is the basic unit of life?"
   - Class: Biology
   - Category: Cells
   - Lesson: Chapter 3
   - Available wrong answers: 1
   - More needed: 2
   - Message: "Add at least 2 more flashcards with Class: 'Biology' and Category: 'Cells'..."

### Benefits

- **Clear**: User knows exactly what's needed
- **Actionable**: Specific guidance on class/category to add
- **Non-invasive**: Collapsible so main message stays clean
- **Helpful**: Prevents confusion about why practice can't start

## Styling

- Details box has light gray background (#f8f9fa)
- Yellow left border (#ffc107) for emphasis
- Yellow highlighted recommendation box inside details
- Responsive and accessible

## Example Messages

```
"Add at least 1 more flashcard with Class: 'Chemistry' and Category: 'Reactions' to create proper multiple choice options."

"Add at least 3 more flashcards with Class: 'Biology' and Category: 'Genetics' to create proper multiple choice options."
```

## Testing

### Manual Test Steps

1. Add a flashcard with class "Science" and category "Physics"
2. Try to practice - should show "More Entries Needed"
3. Click to expand diagnostic details
4. Verify all information is correct and helpful
5. Add more flashcards matching the recommended class/category
6. Try practice again - should now load cards

### Expected Output

```
📝 More Entries Needed

Not enough entries in this category to practice. Add more flashcards to create multiple choice options.

📋 What entries are missing? (collapsed by default)
  Current Card: What is Newton's first law?
  Class: Physics
  Category: Motion
  Lesson: Chapter 1

  Available wrong answers: 0
  More needed: 3

  Add at least 3 more flashcards with Class: "Physics" and Category: "Motion" to create proper multiple choice options.

[Add More Flashcards] button
```

## Files Modified

- **src/scripts/js/modules/auth/practice.mjs** - Return diagnostic object instead of null
- **src/routes/practice.mjs** - Pass diagnostic to frontend
- **src/views/practice.ejs** - Display collapsible diagnostic section

## Commit

- `8368ec8` - Add diagnostic info to insufficient entries message with collapsible details

## Related Features

- [Filter-Aware Dashboard Statistics](./FILTER_AWARE_STATS.md)
- [Multiple Choice Option Generation](./PRACTICE_FILTERING_COMPLETE.md)
