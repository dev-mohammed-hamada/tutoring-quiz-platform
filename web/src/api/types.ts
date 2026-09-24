/**
 * Response shapes, mirroring `api/src/serializers/*.ts`. The request bodies come
 * from `@quiz/shared`; the responses are hand-built by role-specific serializers
 * on the API side, so they are declared here rather than inferred from a schema.
 */
export type Role = 'student' | 'teacher' | 'principal';
export type Locale = 'en' | 'ar';

export interface Me {
  id: number;
  role: Role;
  locale: Locale;
  classId: number | null;
  fullName: string;
}

/** `state` as computed by GET /api/quizzes for a student. */
export type StudentQuizState =
  | 'available' | 'not_open_yet' | 'closed' | 'in_progress' | 'expired' | 'submitted';

export interface StudentQuiz {
  id: number;
  title: string;
  language: Locale;
  timeLimitMinutes: number;
  opensAt: string;
  closesAt: string;
  negativeMarking: boolean;
  questionCount: number;
  totalMarks: number;
  state: StudentQuizState;
  attemptId: number | null;
  displayScore: number | null;
}

export interface AttemptOption { id: number; position: number; text: string }

export interface AttemptQuestion {
  id: number;
  position: number;
  text: string;
  points: number;
  pointsLabel: string;
  options: AttemptOption[];
}

export interface AttemptPayload {
  attempt: {
    id: number;
    expiresAt: string;
    submittedAt: string | null;
    state: 'not_started' | 'in_progress' | 'expired' | 'submitted';
    maxScore: number;
  };
  quiz: { id: number; title: string; language: Locale; negativeMarking: boolean; timeLimitMinutes: number };
  /** The only clock the countdown trusts. */
  serverNow: string;
  questions: AttemptQuestion[];
  answers: { questionId: number; selectedOptionId: number | null }[];
}

interface ResultBase {
  displayScore: number;
  displayScoreLabel: string;
  maxScore: number;
  maxScoreLabel: string;
}

/** The locked shape carries no answer key at all - it is absent, not hidden. */
export interface LockedResult extends ResultBase {
  locked: true;
  answersAvailableAt: string;
}

export interface UnlockedResult extends ResultBase {
  locked: false;
  questions: {
    id: number; position: number; text: string; points: number; pointsLabel: string;
    yourOptionId: number | null; correctOptionId: number;
    awarded: number; awardedLabel: string;
    options: AttemptOption[];
  }[];
}

export type ResultPayload = LockedResult | UnlockedResult;

export interface HistoryEntry {
  attemptId: number;
  quizId: number;
  title: string;
  language: Locale;
  displayScore: number;
  maxScore: number;
  submittedAt: string;
  submittedReason: 'manual' | 'expiry';
  reviewReleased: boolean;
  reviewAvailableAt: string;
}
