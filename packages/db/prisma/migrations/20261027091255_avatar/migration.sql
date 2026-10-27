-- CreateTable
CREATE TABLE "avatar" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatar_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "avatar" ADD CONSTRAINT "avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
