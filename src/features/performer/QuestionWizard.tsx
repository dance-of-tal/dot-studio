import { useState, useEffect, useRef } from 'react';
import type { QuestionRequest } from '@opencode-ai/sdk/v2';
import { HelpCircle, Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import './AgentInput.css';

interface QuestionWizardProps {
    request: QuestionRequest;
    onRespond: (answers: Record<string, string[]>) => void;
    onReject: () => void;
    responding: boolean;
}

export default function QuestionWizard({ request, onRespond, onReject, responding }: QuestionWizardProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    // Keys are the `header` of the QuestionInfo, limits are arrays of strings.
    const [answers, setAnswers] = useState<Record<string, string[]>>({});
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    const questions = request.questions || [];
    const isLast = currentIndex === questions.length - 1;
    const currentQ = questions[currentIndex];

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [currentIndex]);

    const handleNext = () => {
        if (isLast) {
            // Fill missing answers with empty arrays to satisfy OpenCode if needed,
            // or just rely on what was collected.
            const finalAnswers: Record<string, string[]> = {};
            questions.forEach(q => {
                finalAnswers[q.header] = answers[q.header] || [];
            });
            onRespond(finalAnswers);
        } else {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Prevent enter from triggering general chat send
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
    
    // Derived UI flags based on schema
    const hasOptions = Array.isArray(currentQ.options) && currentQ.options.length > 0;
    const canTypeCustom = currentQ.custom !== false; // defaults to true
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
            // If multiple is allowed, how do we treat custom text?
            // Since it's an array of strings, we can just replace the *last* non-option item,
            // or simply set it as the only non-option string. 
            // For simplicity, let's separate custom text from selected options by assuming
            // custom text overwrites the entire selection if not multiple, or appends if multiple.
            const opts = currentQ.options?.map(o => o.label) || [];
            const selectedOpts = currentSelection.filter(s => opts.includes(s));
            if (text.trim() === '') {
                setAnswerList(selectedOpts);
            } else {
                setAnswerList([...selectedOpts, text]);
            }
        } else {
            // Single choice and custom text overrides any selected option
            setAnswerList([text]);
        }
    };

    return (
        <div className="chat-input__warning" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-panel)' }}>
            <div className="warning-content" style={{ paddingBottom: 0 }}>
                <HelpCircle size={16} className="warning-icon" style={{ color: 'var(--accent)' }} />
                <div className="warning-text" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{currentQ.header} ({currentIndex + 1} of {questions.length})</strong>
                    </div>
                    <div className="warning-description" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {currentQ.question}
                    </div>

                    <div style={{ marginTop: '12px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        
                        {hasOptions && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {currentQ.options.map((opt) => (
                                    <label key={opt.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                        <input
                                            type={isMultiple ? "checkbox" : "radio"}
                                            name={`q_${currentQ.header}`}
                                            checked={currentSelection.includes(opt.label)}
                                            onChange={() => handleOptionToggle(opt.label)}
                                            disabled={responding}
                                            style={{ marginTop: '2px' }}
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 500 }}>{opt.label}</span>
                                            {opt.description && (
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{opt.description}</span>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        {canTypeCustom && (
                            <textarea
                                ref={inputRef as any}
                                className="text-input"
                                style={{ width: '100%', minHeight: '60px', padding: '8px', fontSize: '13px', marginTop: hasOptions ? '8px' : '0' }}
                                value={
                                    isMultiple 
                                        ? currentSelection.find(s => !currentQ.options?.find(o => o.label === s)) || ''
                                        : (currentQ.options?.find(o => o.label === currentSelection[0]) ? '' : (currentSelection[0] || ''))
                                }
                                onChange={(e) => handleCustomTextChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={hasOptions ? "Or type your own answer..." : "Type your answer..."}
                                disabled={responding}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="warning-actions" style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                <button
                    className="warning-action-btn reject"
                    onClick={() => onReject()}
                    disabled={responding}
                    style={{ background: 'transparent', color: 'var(--text-secondary)' }}
                    title="Cancel Question Flow"
                >
                    <X size={12} style={{ marginRight: '4px' }} />
                    Cancel
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                    {currentIndex > 0 && (
                        <button
                            className="warning-action-btn"
                            onClick={handlePrev}
                            disabled={responding}
                            style={{ background: 'var(--bg-hover)' }}
                        >
                            <ChevronLeft size={12} style={{ marginRight: '4px' }} />
                            Back
                        </button>
                    )}
                    
                    <button
                        className="warning-action-btn always"
                        onClick={handleNext}
                        disabled={responding}
                        style={{ background: 'var(--accent-color)', color: 'white' }}
                    >
                        {isLast ? (
                            <>
                                <Check size={12} style={{ marginRight: '4px' }} />
                                Submit
                            </>
                        ) : (
                            <>
                                Next
                                <ChevronRight size={12} style={{ marginLeft: '4px' }} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
