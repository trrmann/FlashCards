/**
 * Entries Routes
 * Handles flashcard CRUD and sharing
 */

import express from 'express';
import { BaseRouter } from './baseRouter.mjs';
import { entriesService } from '../auth/entriesService.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';
import { mediaArchiveService } from '../auth/mediaArchiveService.mjs';

class EntriesRouter extends BaseRouter {
  registerRoutes() {
    const router = this.router;

    /**
     * POST /api/entries
     * Create a new flashcard entry
     */
    router.post('/', express.json({ limit: '15mb' }), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const {
          question,
          answer,
          lesson,
          category,
          class: flashClass,
          questionType,
          lang,
          answerLang,
          answerMode,
          questionBlock,
          answerBlock,
          options,
        } = req.body;

        // Audio questions carry the question in the recording; text is an optional caption
        const isAudioQuestion = questionBlock?.form === 'audio' && Boolean(questionBlock?.media);
        if ((!question && !isAudioQuestion) || !answer) {
          return res.status(400).json({
            status: 'error',
            message: 'Question and answer are required',
          });
        }

        // Storage quota enforcement
        const payloadBytes =
          (question?.length || 0) +
          (answer?.length || 0) +
          (questionBlock?.media?.length || 0) +
          (answerBlock?.media?.length || 0) +
          (Array.isArray(options)
            ? options.reduce((sum, option) => sum + (option?.media?.length || 0), 0)
            : 0);
        const used = await entriesService.getStorageUsage(req.session.userId);
        const limit = await userAuthService.getStorageLimit(req.session.userId);
        if (limit !== null && used + payloadBytes > limit) {
          return res.status(413).json({
            status: 'error',
            message: `Storage limit exceeded: using ${used} of ${limit} bytes; this card needs ${payloadBytes} more. Remove elements or ask an admin to raise your limit.`,
          });
        }

        const flashcard = await entriesService.createFlashcard(
          req.session.userId,
          question || '',
          answer,
          lesson || null,
          category || null,
          flashClass || null,
          { questionType, lang, answerLang, answerMode, questionBlock, answerBlock, options }
        );

        return res.status(201).json({
          status: 'success',
          message: 'Entry created successfully',
          flashcard,
        });
      } catch (error) {
        console.error('Create entry error:', error.message);
        if (error.statusCode === 400) {
          return res.status(400).json({ status: 'error', message: error.message });
        }
        return res.status(500).json({ status: 'error', message: 'Failed to create entry' });
      }
    });

    /**
     * GET /api/entries
     * Get all entries for the authenticated user (with optional filters)
     * Query params: ?class=Biology101&lesson=Lesson5&category=Taxonomy
     */
    router.get('/', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        // Extract filter parameters from query string
        const filters = {};
        if (req.query.class) filters.class = req.query.class;
        if (req.query.lesson) filters.lesson = req.query.lesson;
        if (req.query.category) filters.category = req.query.category;

        // Use filtered query if filters provided, otherwise get all
        let flashcards;
        if (Object.keys(filters).length > 0) {
          flashcards = await entriesService.getUserFlashcardsFiltered(req.session.userId, filters);
        } else {
          flashcards = await entriesService.getUserFlashcards(req.session.userId);
        }

        return res.status(200).json({
          status: 'success',
          count: flashcards.length,
          filters: Object.keys(filters).length > 0 ? filters : null,
          entries: flashcards,
        });
      } catch (error) {
        console.error('Get entries error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch entries' });
      }
    });

    /**
     * Collect the user's cards (optionally filtered) together with their
     * options and the ids of every media item the set references. Shared by
     * the data (JSON) and media (ZIP) halves of the two-file export.
     */
    this.collectExportSet = async (userId, query) => {
      const filters = {};
      if (query.class) filters.class = query.class;
      if (query.lesson) filters.lesson = query.lesson;
      if (query.category) filters.category = query.category;

      const flashcards =
        Object.keys(filters).length > 0
          ? await entriesService.getUserFlashcardsFiltered(userId, filters)
          : await entriesService.getUserFlashcards(userId);

      const optionsByCard = await entriesService.getOptionsForCards(
        flashcards.map((card) => card.flashcard_id)
      );

      const mediaIds = new Set();
      for (const card of flashcards) {
        if (card.question_media_id) mediaIds.add(card.question_media_id);
        if (card.answer_media_id) mediaIds.add(card.answer_media_id);
        for (const option of optionsByCard.get(card.flashcard_id) || []) {
          if (option.option_media_id) mediaIds.add(option.option_media_id);
        }
      }

      return { filters, flashcards, optionsByCard, mediaIds: [...mediaIds] };
    };

    /**
     * GET /api/entries/export
     * Export the data half of the two-file export: a JSON of the user's
     * entries (blocks, languages, options) referencing media by id, with a
     * manifest of the linked media ZIP (GET /api/entries/export/media).
     * Query params: ?class=&lesson=&category= (optional filtered export)
     */
    router.get('/export', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { filters, flashcards, optionsByCard, mediaIds } = await this.collectExportSet(
          req.session.userId,
          req.query
        );
        const mediaRows = await entriesService.getMediaByIds(req.session.userId, mediaIds);

        const exportData = {
          version: '2.0',
          exportedAt: new Date().toISOString(),
          exportedBy: req.session.username || req.session.userId,
          filters: Object.keys(filters).length > 0 ? filters : null,
          count: flashcards.length,
          media: mediaArchiveService.buildManifest(mediaRows),
          entries: flashcards.map((card) => ({
            question: card.question,
            answer: card.answer,
            lesson: card.lesson,
            category: card.category,
            class: card.class,
            is_private: card.is_private,
            question_type: card.question_type,
            lang: card.lang,
            answer_lang: card.answer_lang,
            answer_mode: card.answer_mode,
            question_form: card.question_form,
            question_media: card.question_media_id || null,
            answer_form: card.answer_form,
            answer_media: card.answer_media_id || null,
            options: (optionsByCard.get(card.flashcard_id) || []).map((option) => ({
              text: option.option_text,
              isCorrect: option.is_correct,
              form: option.option_form,
              media: option.option_media_id || null,
            })),
          })),
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="flashcards-export-${Date.now()}.json"`
        );
        return res.status(200).send(JSON.stringify(exportData, null, 2));
      } catch (error) {
        console.error('Export entries error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to export entries' });
      }
    });

    /**
     * GET /api/entries/export/media
     * Export the media half of the two-file export: a ZIP of every media
     * item referenced by the (optionally filtered) entry set, each stored as
     * media/<media_id>.<ext> so the JSON's media references resolve to it.
     */
    router.get('/export/media', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { mediaIds } = await this.collectExportSet(req.session.userId, req.query);
        const mediaRows = await entriesService.getMediaByIds(req.session.userId, mediaIds);
        const archive = mediaArchiveService.buildArchive(mediaRows);

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="flashcards-media-${Date.now()}.zip"`
        );
        return res.status(200).send(archive);
      } catch (error) {
        console.error('Export media error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to export media' });
      }
    });

    /**
     * POST /api/entries/import
     * Import the two linked files: the entries JSON (body.entries) and the
     * optional media ZIP (body.mediaArchive, base64). Media references in the
     * JSON resolve to archive items by media id; without the archive the text
     * content still imports and the media references are skipped.
     * Body: { entries: [...], mediaArchive: '<base64 zip>' }
     */
    router.post('/import', express.json({ limit: '50mb' }), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { entries, mediaArchive } = req.body;

        let archiveMedia = new Map();
        if (mediaArchive) {
          try {
            archiveMedia = mediaArchiveService.parseArchive(mediaArchive);
          } catch (archiveError) {
            return res.status(400).json({
              status: 'error',
              message: `Invalid media archive: ${archiveError.message}`,
            });
          }
        }

        // Turn an exported block reference into a create/update block
        // descriptor, resolving media ids against the uploaded archive.
        let skippedMedia = 0;
        const blockFrom = (form, mediaRef) => {
          if (!form || form === 'text' || form === 'text_tts') return { form: form || 'text' };
          const item = mediaRef ? archiveMedia.get(mediaRef) : null;
          if (!item) {
            if (mediaRef) skippedMedia += 1;
            return { form: 'text' };
          }
          return { form, media: item.dataUrl };
        };

        if (!Array.isArray(entries)) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid import format. Expected array of entries.',
          });
        }

        if (entries.length === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'No entries to import.',
          });
        }

        // Validate entries: answer text is required; question text may be
        // empty for audio questions whose recording is in the archive
        const validEntries = entries.filter((entry) => {
          const hasQuestionText = entry.question && typeof entry.question === 'string';
          const hasAudioQuestion =
            entry.question_form === 'audio' &&
            entry.question_media &&
            archiveMedia.has(entry.question_media);
          return (
            (hasQuestionText || hasAudioQuestion) &&
            entry.answer &&
            typeof entry.answer === 'string'
          );
        });

        if (validEntries.length === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'No valid entries found. Each entry must have question and answer fields.',
          });
        }

        // Storage quota enforcement across the whole import payload
        const payloadBytes =
          validEntries.reduce(
            (sum, entry) => sum + (entry.question?.length || 0) + (entry.answer?.length || 0),
            0
          ) + [...archiveMedia.values()].reduce((sum, item) => sum + item.dataUrl.length, 0);
        const used = await entriesService.getStorageUsage(req.session.userId);
        const limit = await userAuthService.getStorageLimit(req.session.userId);
        if (limit !== null && used + payloadBytes > limit) {
          return res.status(413).json({
            status: 'error',
            message: `Storage limit exceeded: using ${used} of ${limit} bytes; this import needs ${payloadBytes} more. Remove elements or ask an admin to raise your limit.`,
          });
        }

        // Import entries (create new or update existing based on question)
        const importedCards = [];
        const updatedCards = [];
        const errors = [];

        for (const entry of validEntries) {
          try {
            const questionBlock = blockFrom(entry.question_form, entry.question_media);
            const answerBlock = blockFrom(entry.answer_form, entry.answer_media);
            const options = Array.isArray(entry.options)
              ? entry.options.map((option) => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                  ...blockFrom(option.form, option.media),
                }))
              : undefined;

            // Check if a flashcard with the same question already exists
            const existingCard = entry.question
              ? await entriesService.getFlashcardByQuestion(req.session.userId, entry.question)
              : null;

            if (existingCard) {
              // Update the existing flashcard, including its blocks
              const [questionForm, questionMediaId] = await entriesService.resolveBlock(
                req.session.userId,
                questionBlock
              );
              const [answerForm, answerMediaId] = await entriesService.resolveBlock(
                req.session.userId,
                answerBlock
              );
              const updated = await entriesService.updateFlashcard(
                existingCard.flashcard_id,
                req.session.userId,
                {
                  answer: entry.answer,
                  lesson: entry.lesson || null,
                  category: entry.category || null,
                  class: entry.class || null,
                  question_type: entry.question_type || 'standard',
                  lang: entry.lang || 'en-US',
                  answer_lang: entry.answer_lang || null,
                  answer_mode: entry.answer_mode || 'choice',
                  question_form: questionForm,
                  question_media_id: questionMediaId,
                  answer_form: answerForm,
                  answer_media_id: answerMediaId,
                }
              );
              if (options) {
                await entriesService.replaceFlashcardOptions(
                  existingCard.flashcard_id,
                  options,
                  req.session.userId
                );
              }
              updatedCards.push(updated);
            } else {
              // Create a new flashcard with its blocks
              const card = await entriesService.createFlashcard(
                req.session.userId,
                entry.question || '',
                entry.answer,
                entry.lesson || null,
                entry.category || null,
                entry.class || null,
                {
                  questionType: entry.question_type,
                  lang: entry.lang,
                  answerLang: entry.answer_lang,
                  answerMode: entry.answer_mode,
                  questionBlock,
                  answerBlock,
                  options,
                }
              );
              importedCards.push(card);
            }
          } catch (error) {
            errors.push({
              question: String(entry.question || '(audio question)').substring(0, 50),
              error: error.message,
            });
          }
        }

        return res.status(201).json({
          status: 'success',
          message: `Imported ${importedCards.length + updatedCards.length} entries (${importedCards.length} new, ${updatedCards.length} updated)`,
          count: importedCards.length + updatedCards.length,
          created: importedCards.length,
          updated: updatedCards.length,
          errors: errors.length > 0 ? errors : null,
          skippedMedia: skippedMedia > 0 ? skippedMedia : 0,
          imported: importedCards,
          updatedEntries: updatedCards,
        });
      } catch (error) {
        console.error('Import entries error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to import entries' });
      }
    });

    /**
     * GET /api/entries/public
     * Public cards from other users (auto-approved; excludes removed)
     */
    router.get('/storage', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }
        const used = await entriesService.getStorageUsage(req.session.userId);
        const limit = await userAuthService.getStorageLimit(req.session.userId);
        return res.status(200).json({
          status: 'success',
          usedBytes: used,
          maxBytes: limit,
          remainingBytes: limit === null ? null : Math.max(0, limit - used),
          overLimit: limit !== null && used > limit,
        });
      } catch (error) {
        console.error('Storage usage error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to get storage usage' });
      }
    });

    router.get('/public', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const cards = await entriesService.getPublicCards(req.session.userId);

        return res.status(200).json({ status: 'success', count: cards.length, cards });
      } catch (error) {
        console.error('Get public cards error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch public cards' });
      }
    });

    /**
     * GET /api/entries/public/removed
     * Public cards this user removed (for restore)
     */
    router.get('/public/removed', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const cards = await entriesService.getRemovedPublicCards(req.session.userId);

        return res.status(200).json({ status: 'success', count: cards.length, cards });
      } catch (error) {
        console.error('Get removed public cards error:', error.message);
        return res
          .status(500)
          .json({ status: 'error', message: 'Failed to fetch removed public cards' });
      }
    });

    /**
     * POST /api/entries/public/remove-batch
     * Remove multiple public cards from this user's study set in one request
     */
    router.post('/public/remove-batch', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const flashcardIds = Array.isArray(req.body.flashcardIds) ? req.body.flashcardIds : [];
        if (flashcardIds.length === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'flashcardIds must be a non-empty array',
          });
        }

        const removed = await entriesService.removePublicCardsBatch(
          req.session.userId,
          flashcardIds
        );

        return res.status(200).json({
          status: 'success',
          message: `${removed} public card(s) removed from your study set`,
          removed,
        });
      } catch (error) {
        console.error('Batch remove public cards error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to remove public cards' });
      }
    });

    /**
     * POST /api/entries/public/restore-batch
     * Restore multiple removed public cards in one request
     */
    router.post('/public/restore-batch', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const flashcardIds = Array.isArray(req.body.flashcardIds) ? req.body.flashcardIds : [];
        if (flashcardIds.length === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'flashcardIds must be a non-empty array',
          });
        }

        const restored = await entriesService.restorePublicCardsBatch(
          req.session.userId,
          flashcardIds
        );

        return res.status(200).json({
          status: 'success',
          message: `${restored} public card(s) restored to your study set`,
          restored,
        });
      } catch (error) {
        console.error('Batch restore public cards error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to restore public cards' });
      }
    });

    /**
     * POST /api/entries/public/:flashcardId/remove
     * Remove a public card from this user's study set
     */
    router.post('/public/:flashcardId/remove', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        await entriesService.removePublicCard(req.session.userId, req.params.flashcardId);

        return res
          .status(200)
          .json({ status: 'success', message: 'Public card removed from your study set' });
      } catch (error) {
        console.error('Remove public card error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to remove public card' });
      }
    });

    /**
     * POST /api/entries/public/:flashcardId/restore
     * Restore a removed public card to this user's study set
     */
    router.post('/public/:flashcardId/restore', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        await entriesService.restorePublicCard(req.session.userId, req.params.flashcardId);

        return res
          .status(200)
          .json({ status: 'success', message: 'Public card restored to your study set' });
      } catch (error) {
        console.error('Restore public card error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to restore public card' });
      }
    });

    /**
     * GET /api/entries/:flashcardId
     * Get a specific flashcard
     */
    router.get('/:flashcardId/options', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }
        const options = await entriesService.getFlashcardOptions(req.params.flashcardId);
        return res.status(200).json({ status: 'success', options });
      } catch (error) {
        console.error('Get options error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch options' });
      }
    });

    router.get('/:flashcardId', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const flashcard = await entriesService.getFlashcard(
          req.params.flashcardId,
          req.session.userId
        );

        if (!flashcard) {
          return res.status(404).json({ status: 'error', message: 'Flashcard not found' });
        }

        return res.status(200).json({
          status: 'success',
          flashcard,
        });
      } catch (error) {
        console.error('Get flashcard error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch flashcard' });
      }
    });

    /**
     * PUT /api/entries/:flashcardId
     * Update a flashcard entry
     */
    router.put('/:flashcardId', express.json({ limit: '15mb' }), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        if (Array.isArray(req.body.options)) {
          entriesService.validateOptionForms(req.body.options);
        }

        const updated = await entriesService.updateFlashcard(
          req.params.flashcardId,
          req.session.userId,
          req.body
        );

        if (!updated) {
          return res.status(403).json({
            status: 'error',
            message: 'Not authorized or flashcard not found',
          });
        }

        if (Array.isArray(req.body.options)) {
          await entriesService.replaceFlashcardOptions(
            req.params.flashcardId,
            req.body.options,
            req.session.userId
          );
        }

        return res.status(200).json({
          status: 'success',
          message: 'Entry updated successfully',
          flashcard: updated,
        });
      } catch (error) {
        console.error('Update entry error:', error.message);
        if (error.statusCode === 400) {
          return res.status(400).json({ status: 'error', message: error.message });
        }
        return res.status(500).json({ status: 'error', message: 'Failed to update entry' });
      }
    });

    /**
     * DELETE /api/entries/:flashcardId
     * Delete a flashcard entry
     */
    router.delete('/:flashcardId', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const deleted = await entriesService.deleteFlashcard(
          req.params.flashcardId,
          req.session.userId
        );

        if (!deleted) {
          return res.status(403).json({
            status: 'error',
            message: 'Not authorized or flashcard not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'Entry deleted successfully',
        });
      } catch (error) {
        console.error('Delete entry error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to delete entry' });
      }
    });

    /**
     * POST /api/entries/visibility-batch
     * Set public/private on multiple owned flashcards.
     * Body: { flashcardIds: string[], isPrivate: boolean }
     */
    router.post('/visibility-batch', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const flashcardIds = Array.isArray(req.body.flashcardIds) ? req.body.flashcardIds : [];
        const { isPrivate } = req.body;

        if (flashcardIds.length === 0 || typeof isPrivate !== 'boolean') {
          return res.status(400).json({
            status: 'error',
            message: 'flashcardIds must be a non-empty array and isPrivate a boolean',
          });
        }

        const updated = await entriesService.setFlashcardsVisibilityBatch(
          req.session.userId,
          flashcardIds,
          isPrivate
        );

        return res.status(200).json({
          status: 'success',
          message: `${updated} flashcard(s) made ${isPrivate ? 'private' : 'public'}`,
          updated,
          skipped: flashcardIds.length - updated,
        });
      } catch (error) {
        console.error('Visibility batch error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to update visibility' });
      }
    });

    /**
     * POST /api/entries/share-batch
     * Share multiple flashcards with multiple recipients in one request.
     * Body: { flashcardIds: string[], recipientUsernames: string[] }
     * Recipients may be public (combo box) or typed exact usernames.
     */
    router.post('/share-batch', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const flashcardIds = Array.isArray(req.body.flashcardIds) ? req.body.flashcardIds : [];
        const recipientUsernames = Array.isArray(req.body.recipientUsernames)
          ? [...new Set(req.body.recipientUsernames.map((u) => String(u).trim()).filter(Boolean))]
          : [];

        if (flashcardIds.length === 0 || recipientUsernames.length === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'flashcardIds and recipientUsernames must be non-empty arrays',
          });
        }

        // Resolve recipients (case-insensitive); collect unknown names
        const recipients = [];
        const unknownUsernames = [];
        for (const username of recipientUsernames) {
          const user = await userAuthService.findUserByUsernameInsensitive(username);
          if (user) {
            recipients.push({ user_id: user.user_id, username: user.username });
          } else {
            unknownUsernames.push(username);
          }
        }

        if (recipients.length === 0) {
          return res.status(404).json({
            status: 'error',
            message: `No recipients found: ${unknownUsernames.join(', ')}`,
          });
        }

        const results = await entriesService.shareFlashcardsBatch(
          req.session.userId,
          flashcardIds,
          recipients
        );

        return res.status(results.shared > 0 ? 201 : 400).json({
          status: results.shared > 0 ? 'success' : 'error',
          message: `Shared ${results.shared} of ${flashcardIds.length * recipientUsernames.length} share(s)`,
          shared: results.shared,
          failures: results.failures,
          unknownUsernames,
        });
      } catch (error) {
        console.error('Batch share error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to share flashcards' });
      }
    });

    /**
     * POST /api/entries/:flashcardId/share
     * Share a flashcard with another user
     */
    router.post('/:flashcardId/share', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const recipientUsername = (req.body.recipientUsername || req.body.username || '').trim();

        if (!recipientUsername) {
          return res.status(400).json({
            status: 'error',
            message: 'recipientUsername is required',
          });
        }

        // Get recipient ID from username (case-insensitive, whitespace-tolerant)
        const recipient = await userAuthService.findUserByUsernameInsensitive(recipientUsername);

        if (!recipient) {
          return res.status(404).json({
            status: 'error',
            message: 'Recipient user not found',
          });
        }

        const recipientId = recipient.user_id;

        const share = await entriesService.shareFlashcard(
          req.params.flashcardId,
          req.session.userId,
          recipientId
        );

        return res.status(201).json({
          status: 'success',
          message: 'Flashcard shared successfully',
          share,
        });
      } catch (error) {
        console.error('Share error:', error.message);
        return res.status(400).json({ status: 'error', message: error.message });
      }
    });

    /**
     * POST /api/entries/:flashcardId/revoke
     * Revoke a flashcard share
     */
    router.post('/:flashcardId/revoke', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { recipientId } = req.body;

        if (!recipientId) {
          return res.status(400).json({
            status: 'error',
            message: 'recipientId is required',
          });
        }

        const revoked = await entriesService.revokeShare(
          req.params.flashcardId,
          req.session.userId,
          recipientId
        );

        if (!revoked) {
          return res.status(404).json({
            status: 'error',
            message: 'Share not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'Share revoked successfully',
        });
      } catch (error) {
        console.error('Revoke error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to revoke share' });
      }
    });

    /**
     * POST /api/entries/shares/:shareId/accept
     * Accept a shared flashcard
     */
    router.post('/shares/:shareId/accept', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const share = await entriesService.acceptShare(req.params.shareId, req.session.userId);

        if (!share) {
          return res.status(404).json({
            status: 'error',
            message: 'Share not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'Share accepted successfully',
          share,
        });
      } catch (error) {
        console.error('Accept share error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to accept share' });
      }
    });

    /**
     * POST /api/entries/shares/:shareId/reject
     * Reject a shared flashcard
     * Note: Rejection is not reported back to the owner
     */
    router.post('/shares/:shareId/reject', express.json(), async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const share = await entriesService.rejectShare(req.params.shareId, req.session.userId);

        if (!share) {
          return res.status(404).json({
            status: 'error',
            message: 'Share not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'Share rejected (not reported to owner)',
          share,
        });
      } catch (error) {
        console.error('Reject share error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to reject share' });
      }
    });

    /**
     * GET /api/entries/shares/pending
     * Get pending shares for the authenticated user
     */
    router.get('/shares/pending', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const shares = await entriesService.getPendingShares(req.session.userId);

        return res.status(200).json({
          status: 'success',
          count: shares.length,
          shares,
        });
      } catch (error) {
        console.error('Get pending shares error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch pending shares' });
      }
    });

    /**
     * GET /api/entries/shares/accepted
     * Get accepted shares for the authenticated user
     */
    router.get('/shares/accepted', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const shares = await entriesService.getAcceptedShares(req.session.userId);

        return res.status(200).json({
          status: 'success',
          count: shares.length,
          shares,
        });
      } catch (error) {
        console.error('Get accepted shares error:', error.message);
        return res
          .status(500)
          .json({ status: 'error', message: 'Failed to fetch accepted shares' });
      }
    });

    /**
     * GET /api/entries/shared-by-me
     * Get all shares owned by the authenticated user
     */
    router.get('/shared-by-me', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const shares = await entriesService.getOwnedShares(req.session.userId);

        return res.status(200).json({
          status: 'success',
          count: shares.length,
          shares,
        });
      } catch (error) {
        console.error('Get owned shares error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch owned shares' });
      }
    });

    /**
     * GET /api/entries/metadata/classes
     * Get all unique class values for the authenticated user
     */
    router.get('/metadata/classes', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const classes = await entriesService.getDistinctClasses(req.session.userId);

        return res.status(200).json({
          status: 'success',
          classes,
        });
      } catch (error) {
        console.error('Get classes error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch classes' });
      }
    });

    /**
     * GET /api/entries/metadata/lessons
     * Get all unique lesson values for the authenticated user
     */
    router.get('/metadata/lessons', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const lessons = await entriesService.getDistinctLessons(req.session.userId);

        return res.status(200).json({
          status: 'success',
          lessons,
        });
      } catch (error) {
        console.error('Get lessons error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch lessons' });
      }
    });

    /**
     * GET /api/entries/metadata/categories
     * Get all unique category values for the authenticated user
     */
    router.get('/metadata/categories', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const categories = await entriesService.getDistinctCategories(req.session.userId);

        return res.status(200).json({
          status: 'success',
          categories,
        });
      } catch (error) {
        console.error('Get categories error:', error.message);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch categories' });
      }
    });

    /**
     * GET /api/entries/metadata/lessons/:class
     * Get all unique lesson values for a specific class
     */
    router.get('/metadata/lessons/:className', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { className } = req.params;

        const lessons = await entriesService.getDistinctLessonsForClass(
          className,
          req.session.userId
        );

        return res.status(200).json({
          status: 'success',
          lessons,
        });
      } catch (error) {
        console.error('Get lessons for class error:', error.message);
        return res
          .status(500)
          .json({ status: 'error', message: 'Failed to fetch lessons for class' });
      }
    });
  }
}

export const entriesRouter = new EntriesRouter();

export { EntriesRouter };
export default entriesRouter.router;
