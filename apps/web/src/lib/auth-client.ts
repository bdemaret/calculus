"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // Champs ajoutés au compte (voir `user.additionalFields` dans lib/auth.ts).
  plugins: [
    inferAdditionalFields({
      user: { voiceInput: { type: "boolean", required: false }, divisionDisplay: { type: "string", required: false } },
    }),
  ],
});
export const { useSession, signIn, signUp, signOut } = authClient;
