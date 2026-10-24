-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled', 'pending');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('manual', 'import', 'insight');

-- CreateEnum
CREATE TYPE "SentimentPolarity" AS ENUM ('positive', 'neutral', 'negative');

-- CreateEnum
CREATE TYPE "RelationKind" AS ENUM ('emotional', 'causal', 'temporal', 'person', 'location', 'topical');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('pending', 'done', 'archived');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('connection', 'emotion_granularity', 'belief_conflict', 'timeline_diff', 'self_distance');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(128),
    "password_hash" VARCHAR(72) NOT NULL,
    "nickname" VARCHAR(64),
    "avatar_url" VARCHAR(512),
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "user_agent" VARCHAR(512),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "real_name" VARCHAR(64),
    "gender" VARCHAR(16),
    "birthday" DATE,
    "blood_type" VARCHAR(8),
    "height_cm" INTEGER,
    "weight_kg" DOUBLE PRECISION,
    "sleep_pattern" VARCHAR(32),
    "diet_preference" VARCHAR(128),
    "mbti" VARCHAR(8),
    "readable_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "off_limit_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quiet_hours" JSONB,
    "data_source_consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feelings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "raw_label" VARCHAR(64) NOT NULL,
    "refined_label" VARCHAR(64),
    "intensity" INTEGER NOT NULL DEFAULT 5,
    "polarity" "SentimentPolarity" NOT NULL DEFAULT 'neutral',
    "content" TEXT,
    "trigger" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'manual',
    "happened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "feelings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" VARCHAR(128),
    "graph_x" DOUBLE PRECISION,
    "graph_y" DOUBLE PRECISION,
    "icon" VARCHAR(32),
    "color_token" VARCHAR(32),
    "feeling_id" UUID,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "source" "RecordSource" NOT NULL DEFAULT 'manual',
    "past_self_view" TEXT,
    "present_self_view" TEXT,
    "past_viewed_at" TIMESTAMP(3),
    "present_viewed_at" TIMESTAMP(3),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_relations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "kind" "RelationKind" NOT NULL DEFAULT 'topical',
    "strength" INTEGER NOT NULL DEFAULT 50,
    "note" VARCHAR(512),
    "discovered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "memory_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_metrics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "metric_type" VARCHAR(32) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "subjective_state" VARCHAR(64),
    "note" VARCHAR(512),
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "RecordSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journeys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "place" VARCHAR(128) NOT NULL,
    "is_resident" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "cover_url" VARCHAR(512),
    "started_at" DATE,
    "ended_at" DATE,
    "note" TEXT,
    "memory_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "note" TEXT,
    "kind" VARCHAR(32) NOT NULL DEFAULT 'task',
    "status" "TodoStatus" NOT NULL DEFAULT 'pending',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "repeat_rule" VARCHAR(16) NOT NULL DEFAULT 'none',
    "people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "body" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "evidence_memory_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence_feeling_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "read_at" TIMESTAMP(3),
    "adopted_at" TIMESTAMP(3),
    "feedback" VARCHAR(16),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "storage_key" VARCHAR(256) NOT NULL,
    "original_name" VARCHAR(256) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "size" INTEGER NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "purpose" VARCHAR(32) NOT NULL DEFAULT 'memory',
    "checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_deleted_at_idx" ON "profiles"("deleted_at");

-- CreateIndex
CREATE INDEX "feelings_user_id_happened_at_idx" ON "feelings"("user_id", "happened_at");

-- CreateIndex
CREATE INDEX "feelings_user_id_polarity_idx" ON "feelings"("user_id", "polarity");

-- CreateIndex
CREATE INDEX "feelings_deleted_at_idx" ON "feelings"("deleted_at");

-- CreateIndex
CREATE INDEX "memories_user_id_occurred_at_idx" ON "memories"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "memories_user_id_deleted_at_idx" ON "memories"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "memories_feeling_id_idx" ON "memories"("feeling_id");

-- CreateIndex
CREATE INDEX "memory_relations_user_id_idx" ON "memory_relations"("user_id");

-- CreateIndex
CREATE INDEX "memory_relations_target_id_idx" ON "memory_relations"("target_id");

-- CreateIndex
CREATE INDEX "memory_relations_deleted_at_idx" ON "memory_relations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "memory_relations_source_id_target_id_kind_key" ON "memory_relations"("source_id", "target_id", "kind");

-- CreateIndex
CREATE INDEX "health_metrics_user_id_metric_type_measured_at_idx" ON "health_metrics"("user_id", "metric_type", "measured_at");

-- CreateIndex
CREATE INDEX "health_metrics_user_id_measured_at_idx" ON "health_metrics"("user_id", "measured_at");

-- CreateIndex
CREATE INDEX "health_metrics_deleted_at_idx" ON "health_metrics"("deleted_at");

-- CreateIndex
CREATE INDEX "journeys_user_id_started_at_idx" ON "journeys"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "journeys_user_id_is_resident_idx" ON "journeys"("user_id", "is_resident");

-- CreateIndex
CREATE INDEX "journeys_deleted_at_idx" ON "journeys"("deleted_at");

-- CreateIndex
CREATE INDEX "todos_user_id_status_due_at_idx" ON "todos"("user_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "todos_user_id_kind_idx" ON "todos"("user_id", "kind");

-- CreateIndex
CREATE INDEX "todos_deleted_at_idx" ON "todos"("deleted_at");

-- CreateIndex
CREATE INDEX "insights_user_id_kind_created_at_idx" ON "insights"("user_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "insights_user_id_read_at_idx" ON "insights"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "insights_deleted_at_idx" ON "insights"("deleted_at");

-- CreateIndex
CREATE INDEX "uploaded_files_user_id_purpose_idx" ON "uploaded_files"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "uploaded_files_checksum_idx" ON "uploaded_files"("checksum");

-- CreateIndex
CREATE INDEX "uploaded_files_deleted_at_idx" ON "uploaded_files"("deleted_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feelings" ADD CONSTRAINT "feelings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_feeling_id_fkey" FOREIGN KEY ("feeling_id") REFERENCES "feelings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_metrics" ADD CONSTRAINT "health_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

