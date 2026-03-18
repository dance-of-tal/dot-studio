import { useState, useEffect, useRef } from 'react';
import type { QuestionRequest } from '@opencode-ai/sdk/v2';
import { HelpCircle, Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import './InteractionDock.css';

interface QuestionWizardProps {
    request: QuestionRequest;
    onRespond: (answers: Record<string, string[]>) => void;
    onReject: () => void;
    responding: boolean;
}

export default function QuestionWizard({ request, onRespond, onReject, responding }: QuestionWizardProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string[]>>({});
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    const questions = request.questions || [];
    const isLast = currentIndex === questions.length - 1;
    const currentQ = questions[currentIndex];

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, [currentIndex]);

    const handleNext = () => {
        if (isLast) {
            const finalAnswers: Record<string, string[]> = {};
            questions.forEach(q => { finalAnswers[q.header] = answers[q.header] || []; });
            onRespond(finalAnswers);
        } else {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            handleNext();
        }
    };

    const setAnswerList = (val: string[]) => {
        if (!currentQ) return;
        setAnswers((prev) => ({ ...prev, [currentQ.header]: val }));
    };

    if (!currentQ) return null;

    const currentSelection = answers[currentQ.header] || [];
    const hasOptions = Array.isArray(currentQ.options) && currentQ.options.length > 0;
    const canTypeCustom = currentQ.custom !== false;
    const isMultiple = !!currentQ.multiple;

    const handleOptionToggle = (val: string) => {
        if (isMultiple) {
            if (currentSelection.includes(val)) {
                setAnswerList(currentSelection.filter(item => item !== val));
            } else {
                setAnswerList([...currentSelection, val]);
            }
        } else {
            setAnswerList([val]);
        }
    };

    const handleCustomTextChange = (text: string) => {
        if (isMultiple) {
            const opts = currentQ.options?.map(o => o.label) || [];
            const selectedOpts = currentSelection.filter(s => opts.includes(s));
            setAnswerList(text.trim() === '' ? selectedOpts : [...selectedOpts, text]);
        } else {
            setAnswerList([text]);
        }
    };

    return (
        <div className="interaction-dock question-dock">
            <div className="question-dock__header">
                <HelpCircle size={16} className="question-dock__icon" />
                <span className="question-dock__title">{currentQ.header}</span>
                <span className="question-dock__step">{currentIndex + 1} / {questions.length}</span>
            </div>

            <div className="question-dock__body">
                <div className="question-dock__question-text">{currentQ.question}</div>

                {hasOptions && (
                    <div className="question-dock__options">
                        {currentQ.options.map((opt) => (
                            <label key={opt.label} className="question-dock__option">
                                <input
                                    type={isMultiple ? 'checkbox' : 'radio'}
                                    name={`q_${currentQ.header}`}
                                    checked={currentSelection.includes(opt.label)}
                                    onChange={() => handleOptionToggle(opt.label)}
                                    disabled={responding}
                                />
                                <div>
                                    <div className="question-dock__option-label">{opt.label}</div>
                                    {opt.description && (
                                        <div className="question-dock__option-desc">{opt.description}</div>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                )}

                {canTypeCustom && (
                    <textarea
                        ref={inputRef as any}
                        className="question-dock__custom-input"
                        value={
                            isMultiple
                                ? currentSelection.find(s => !currentQ.options?.find(o => o.label === s)) || ''
                                : (currentQ.options?.find(o => o.label === currentSelection[0]) ? '' : (currentSelection[0] || ''))
                        }
                        onChange={(e) => handleCustomTextChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={hasOptions ? 'Or type your own answer…' : 'Type your answer…'}
                        disabled={responding}
                    />
                )}
            </div>

            <div className="question-dock__footer">
                <button
                    className="btn btn--sm"
                    onClick={() => onReject()}
                    disabled={responding}
                    title="Cancel Question Flow"
                >
                    <X size={11} />
                    Cancel
                </button>

                <div className="question-dock__footer-end">
                    {currentIndex > 0 && (
                        <button
                            className="btn btn--sm"
                            onClick={handlePrev}
                            disabled={responding}
                        >
                            <ChevronLeft size={11} />
                            Back
                        </button>
                    )}
                    <button
                        className="btn btn--sm btn--primary"
                        onClick={handleNext}
                        disabled={responding}
                    >
                        {isLast ? (
                            <><Check size={11} /> Submit</>
                        ) : (
                            <>Next <ChevronRight size={11} /></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
