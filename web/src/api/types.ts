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

export interface ClassRef { id: number; name: string }

/** GET /api/quizzes as staff. */
export interface TeacherQuiz {
  id: number;
  title: string;
  language: Locale;
  timeLimitMinutes: number;
  opensAt: string;
  closesAt: string;
  negativeMarking: boolean;
  isPublished: boolean;
  classIds: number[];
  questionCount: number;
  totalMarks: number;
}

export interface AuthorOption { id: number; position: number; text: string; isCorrect: boolean }

export interface AuthorQuestion {
  id: number; position: number; text: string; points: number; options: AuthorOption[];
}

/** GET /api/quizzes/:id as staff - the only shape that carries the answer key. */
export interface AuthorQuiz {
  id: number;
  title: string;
  language: Locale;
  timeLimitMinutes: number;
  opensAt: string;
  closesAt: string;
  negativeMarking: boolean;
  isPublished: boolean;
  classIds: number[];
  totalMarks: number;
  questions: AuthorQuestion[];
}

export interface ClassAverage {
  classId: number;
  name: string;
  averageDisplayScore: number | null;
  averageLabel: string | null;
  maxScore: number;
  submitted: number;
  total: number;
}

export interface QuizReport {
  quizId: number;
  title: string;
  language: Locale;
  negativeMarking: boolean;
  opensAt: string;
  closesAt: string;
  maxScore: number;
  classes: ClassAverage[];
}

export interface ReportStudent {
  id: number;
  fullName: string;
  state: 'not_started' | 'in_progress' | 'expired' | 'submitted';
  displayScore: number | null;
  displayScoreLabel: string | null;
  submittedAt: string | null;
  submittedReason: 'manual' | 'expiry' | null;
  /** Principal only - a teacher's payload does not carry this field at all. */
  rawScore?: number | null;
}

export interface ClassReport {
  quizId: number;
  title: string;
  maxScore: number;
  negativeMarking: boolean;
  students: ReportStudent[];
}
