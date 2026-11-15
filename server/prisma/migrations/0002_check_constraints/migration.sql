-- Identity columns of a response depend on the mode (BR-10)
ALTER TABLE "Response" ADD CONSTRAINT response_identity_by_mode_chk CHECK (
  ("mode" = 'IDENTIFIED' AND "respondentId" IS NOT NULL AND "submittedAt" IS NOT NULL)
  OR
  ("mode" = 'ANONYMOUS'  AND "respondentId" IS NULL     AND "submittedAt" IS NULL)
);

-- Rating scale 1-5 and at most one value kind per answer (BR-06)
ALTER TABLE "Answer" ADD CONSTRAINT answer_rating_range_chk
  CHECK ("ratingValue" IS NULL OR "ratingValue" BETWEEN 1 AND 5);
ALTER TABLE "Answer" ADD CONSTRAINT answer_single_value_chk
  CHECK (num_nonnulls("ratingValue", "textValue") <= 1);

-- Lifecycle consistency (BR-04)
ALTER TABLE "Survey" ADD CONSTRAINT survey_published_at_chk CHECK (
  ("status" = 'DRAFT' AND "publishedAt" IS NULL)
  OR ("status" <> 'DRAFT' AND "publishedAt" IS NOT NULL)
);

-- A manual close time exists exactly when the stored status is CLOSED (BR-04).
-- A survey closed by its close date keeps status PUBLISHED and closedAt NULL (DD-14).
ALTER TABLE "Survey" ADD CONSTRAINT survey_closed_at_chk CHECK (
  ("status" = 'CLOSED') = ("closedAt" IS NOT NULL)
);

-- Positions start at 1
ALTER TABLE "Question" ADD CONSTRAINT question_position_chk CHECK ("position" >= 1);
ALTER TABLE "Option"   ADD CONSTRAINT option_position_chk   CHECK ("position" >= 1);

