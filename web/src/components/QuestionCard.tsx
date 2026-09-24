import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import type { AttemptQuestion, Locale } from '../api/types';

/**
 * One question and its four options. The block carries the *quiz's* language,
 * not the interface's: an Arabic question stays Arabic inside an English
 * interface, and each option's own text still gets dir="auto" (D-22).
 */
export function QuestionCard({ question, quizLanguage, selected, onSelect, disabled }: {
  question: AttemptQuestion;
  quizLanguage: Locale;
  selected: number | null;
  onSelect: (optionId: number | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <fieldset className="card stack question" lang={quizLanguage} dir={quizLanguage === 'ar' ? 'rtl' : 'ltr'}>
      <legend className="visually-hidden">{question.text}</legend>
      <Text as="p" className="question__text">{question.text}</Text>

      <div className="stack--tight">
        {question.options.map((o) => (
          <label key={o.id} className={`option${selected === o.id ? ' option--on' : ''}`}>
            <input
              type="radio"
              name={`q${question.id}`}
              value={o.id}
              checked={selected === o.id}
              disabled={disabled}
              onChange={() => onSelect(o.id)}
            />
            <Text>{o.text}</Text>
          </label>
        ))}
      </div>

      {selected !== null && !disabled && (
        <button type="button" className="btn btn--quiet btn--auto" onClick={() => onSelect(null)}>
          {t('attempt.clear')}
        </button>
      )}
    </fieldset>
  );
}
