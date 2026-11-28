-- Optional response quota 1-1000; NULL means unlimited (CHG-14, migration 0003_add_survey_max_responses)
ALTER TABLE "Survey" ADD COLUMN "maxResponses" INTEGER;
ALTER TABLE "Survey" ADD CONSTRAINT survey_max_responses_chk
  CHECK ("maxResponses" IS NULL OR "maxResponses" BETWEEN 1 AND 1000);
