// Auth Types
export interface User {
  id: string;
  email: string;
  role: UserRole;
  /**
   * What this account can do, as the server derives it.
   *
   * A superset of the portal roles the user can switch into, plus
   * capabilities that are not a portal of their own — `candidate` means they
   * are in a selection pool, which opens the learner workspace in pool scope
   * rather than a fourth portal.
   */
  capabilities?: Capability[];
  /** Active clan memberships (clan-scoped roles), returned by /auth/me. */
  clanMemberships?: ClanMembership[];
  firstName: string;
  lastName: string;
  /** Profile photo URL (Cloudinary). Required for mentors/mentees via the gate. */
  profilePictureUrl?: string | null;
  isVerified: boolean;
  /** Onboarding state (mirrors the server User model). */
  profileCompleted?: boolean;
  /** 0=registered, 1=profile, 2=skills, 3=finished. */
  onboardingStep?: number;
  createdAt: string;
  updatedAt: string;
  profile?: UserProfile;
}

export type UserRole = 'admin' | 'mentor' | 'mentee';

/** A portal role, or a capability that is not a portal. */
export type Capability = UserRole | 'candidate';

/** Clan-scoped role (distinct from platform role/capabilities). */
export type ClanRole = 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team';

export interface ClanSummary {
  id: string;
  name: string;
  programId: string;
  status: string;
}

export interface ClanMembership {
  id: string;
  clanId: string;
  userId: string;
  role: ClanRole;
  status: string;
  clan?: ClanSummary;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  /** Classic email-locked invite (mutually exclusive with clanJoinSlug). */
  inviteToken?: string;
  /** Public clan join slug (mutually exclusive with inviteToken). */
  clanJoinSlug?: string;
  /** New-organization signup. Mutually exclusive with invite/join paths. */
  organization?: { name: string; slug: string; timezone: string };
}

export interface tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: tokens;
}

export interface TwoFactorLoginResponse {
  requiresTwoFactor: boolean;
  temporaryToken: string;
  user: User;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}
