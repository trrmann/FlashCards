import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.RENDER_DATABASE_URL,
});

await client.connect();

console.log('\n=== ALL FLASHCARDS FOR USER "tmann" ===\n');
const allCards = await client.query(
  `SELECT flashcard_id, question, answer, class, lesson, category FROM flashcards WHERE created_by = 'tmann' ORDER BY class, lesson, category, flashcard_id`
);

allCards.rows.forEach((row) => {
  console.log(
    `[${row.flashcard_id}] Q: "${row.question}" | A: "${row.answer}" | Class: "${row.class}" | Lesson: "${row.lesson}" | Category: "${row.category}"`
  );
});

console.log(
  `\n=== CARDS MATCHING FILTER: Class='English Connect' AND Lesson='Week 01' AND Category='vocabulary' ===\n`
);
const filtered = await client.query(
  `SELECT flashcard_id, question, class, lesson, category FROM flashcards WHERE created_by = 'tmann' AND class ILIKE 'English Connect' AND lesson ILIKE 'Week 01' AND category ILIKE 'vocabulary'`
);

if (filtered.rows.length === 0) {
  console.log('*** NO CARDS MATCH THIS FILTER ***');
} else {
  filtered.rows.forEach((row) => {
    console.log(`[${row.flashcard_id}] "${row.question}" | Category: "${row.category}"`);
  });
}

console.log(`\n=== ALL CARDS IN BOX 1 FOR "tmann" ===\n`);
const box1 = await client.query(
  `SELECT f.flashcard_id, f.question, f.class, f.lesson, f.category, p.current_box
   FROM flashcards f
   JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
   WHERE f.created_by = 'tmann' AND p.current_box = 1`
);

box1.rows.forEach((row) => {
  console.log(
    `[${row.flashcard_id}] "${row.question}" | Category: "${row.category}" | Box: ${row.current_box}`
  );
});

await client.end();
