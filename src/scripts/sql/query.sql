SELECT 
  flashcard_id,
  question,
  category,
  class,
  lesson,
  current_box,
  times_correct,
  times_incorrect
FROM flashcards f
LEFT JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
WHERE f.created_by = 'tmann'
  AND f.class ILIKE 'English Connect'
  AND f.lesson ILIKE 'Week 01'
  AND f.category ILIKE 'vocabulary'
ORDER BY f.flashcard_id;
