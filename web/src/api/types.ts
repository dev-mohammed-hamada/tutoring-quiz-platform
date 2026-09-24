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
