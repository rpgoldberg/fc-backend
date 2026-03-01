import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';

// RP configuration from environment
function getRPConfig() {
  return {
    rpName: process.env.WEBAUTHN_RP_NAME || 'FigureCollecting',
    rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5081',
  };
}

// Credential structure stored in the User model
export interface StoredCredential {
  credentialId: string;
  publicKey: string;  // base64url encoded
  signCount: number;
  transports?: string[];
  nickname?: string;
  createdAt: Date;
}

// Generate registration options for a user
export async function getRegistrationOptions(
  userId: string,
  userEmail: string,
  userName: string,
  existingCredentials: StoredCredential[] = []
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpName, rpID } = getRPConfig();

  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map(cred => ({
      id: cred.credentialId,
      transports: (cred.transports || []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

// Verify a registration response
export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  const { rpID, origin } = getRPConfig();

  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
}

// Generate authentication options (for login)
export async function getAuthenticationOptions(
  allowCredentials?: StoredCredential[]
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = getRPConfig();

  return generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    ...(allowCredentials && {
      allowCredentials: allowCredentials.map(cred => ({
        id: cred.credentialId,
        transports: (cred.transports || []) as AuthenticatorTransportFuture[],
      })),
    }),
  });
}

// Verify an authentication response
export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credentialPublicKey: string,  // base64url encoded
  credentialSignCount: number,
): Promise<VerifiedAuthenticationResponse> {
  const { rpID, origin } = getRPConfig();

  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: response.id,
      publicKey: Buffer.from(credentialPublicKey, 'base64url'),
      counter: credentialSignCount,
    },
  });
}
