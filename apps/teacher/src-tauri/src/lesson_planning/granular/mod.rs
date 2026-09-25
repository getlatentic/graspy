mod answer_coverage;
mod model;
mod structure_validation;
mod validation;

pub use answer_coverage::{answer_report, AnswerReport};
pub use model::*;

#[cfg(test)]
use sha2::{Digest, Sha256};

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn digest(value: &str) -> String {
        format!("{:x}", Sha256::digest(value.as_bytes()))
    }

    pub(crate) fn granular_record() -> GranularLessonRecord {
        let curriculum_objectives = vec![CurriculumObjectiveRef {
            id: "curriculum-objective-fractions".to_owned(),
            statement: "Compare and order common fractions.".to_owned(),
            sequence: 1,
        }];
        let atomic_objectives = vec![
            AtomicObjective {
                id: "atomic-compare".to_owned(),
                curriculum_objective_id: "curriculum-objective-fractions".to_owned(),
                statement: "Compare two fractions using a common representation.".to_owned(),
                bloom_verb: "compare".to_owned(),
                bloom_level: BloomLevel::Understand,
                sequence: 1,
            },
            AtomicObjective {
                id: "atomic-order".to_owned(),
                curriculum_objective_id: "curriculum-objective-fractions".to_owned(),
                statement: "Order three fractions from least to greatest.".to_owned(),
                bloom_verb: "order".to_owned(),
                bloom_level: BloomLevel::Apply,
                sequence: 2,
            },
        ];
        let knowledge_components = vec![
            KnowledgeComponent {
                id: "knowledge-fraction-model".to_owned(),
                description: "A fraction represents equal parts of one whole.".to_owned(),
                knowledge_type: KnowledgeType::Representation,
                bloom_level: BloomLevel::Remember,
                atomic_objective_ids: vec!["atomic-compare".to_owned()],
                prerequisite_knowledge_component_ids: vec![],
                supporting_record_ids: vec!["record-fraction-model".to_owned()],
                source_form: Some("fraction diagram".to_owned()),
                target_form: Some("fraction notation".to_owned()),
                is_prior_knowledge: true,
            },
            KnowledgeComponent {
                id: "knowledge-compare".to_owned(),
                description: "Fractions can be compared on a shared number line.".to_owned(),
                knowledge_type: KnowledgeType::Concept,
                bloom_level: BloomLevel::Understand,
                atomic_objective_ids: vec!["atomic-compare".to_owned()],
                prerequisite_knowledge_component_ids: vec!["knowledge-fraction-model".to_owned()],
                supporting_record_ids: vec!["record-fraction-model".to_owned()],
                source_form: None,
                target_form: None,
                is_prior_knowledge: false,
            },
            KnowledgeComponent {
                id: "knowledge-order".to_owned(),
                description: "Use a common denominator to order fractions.".to_owned(),
                knowledge_type: KnowledgeType::Procedure,
                bloom_level: BloomLevel::Apply,
                atomic_objective_ids: vec!["atomic-order".to_owned()],
                prerequisite_knowledge_component_ids: vec!["knowledge-compare".to_owned()],
                supporting_record_ids: vec!["record-ordering-fractions".to_owned()],
                source_form: Some("unlike denominators".to_owned()),
                target_form: Some("common denominator".to_owned()),
                is_prior_knowledge: false,
            },
        ];
        let lesson_objectives = vec![
            LessonObjective {
                id: "lesson-objective-compare".to_owned(),
                statement: "Compare two fractions on a number line.".to_owned(),
                sequence: 1,
                curriculum_objective_id: "curriculum-objective-fractions".to_owned(),
                atomic_objective_id: "atomic-compare".to_owned(),
                knowledge_component_id: "knowledge-compare".to_owned(),
            },
            LessonObjective {
                id: "lesson-objective-order".to_owned(),
                statement: "Order three fractions by finding a common denominator.".to_owned(),
                sequence: 2,
                curriculum_objective_id: "curriculum-objective-fractions".to_owned(),
                atomic_objective_id: "atomic-order".to_owned(),
                knowledge_component_id: "knowledge-order".to_owned(),
            },
        ];
        let explanation = |id: &str, content: &str| LessonContentBlock::Explanation {
            id: id.to_owned(),
            content: content.to_owned(),
        };
        let practice = |id: &str, objective: &str, question: &str, answer: &str| {
            LessonContentBlock::Practice {
                id: id.to_owned(),
                lesson_objective_id: objective.to_owned(),
                question: question.to_owned(),
                expected_answer: answer.to_owned(),
                hints: vec!["Use the number line or a common denominator.".to_owned()],
            }
        };
        let steps = vec![
            LessonPlanStep {
                id: "step-introduction".to_owned(),
                sequence: 1,
                role: LessonStepRole::Introduction,
                title: "Reconnect fractions to one whole".to_owned(),
                summary: "Review equal parts and locate familiar fractions.".to_owned(),
                duration_minutes: 7,
                lesson_objective_id: None,
                knowledge_type: None,
                teacher_activities: vec!["Display a fraction model and ask learners to name each marked fraction.".to_owned()],
                learner_activities: vec!["Name the fractions and explain how the whole is divided.".to_owned()],
                blocks: vec![
                    explanation("block-intro-explanation", "Equal parts of one whole can be named as fractions."),
                    LessonContentBlock::Visual {
                        id: "block-fraction-visual".to_owned(),
                        source_record_id: "record-fraction-model".to_owned(),
                        asset_file_name: "fraction-number-line.png".to_owned(),
                        figure_sha256: "a".repeat(64),
                        caption: "Fractions placed on a number line.".to_owned(),
                        alt_text: "A number line from zero to one marked in equal fraction intervals.".to_owned(),
                    },
                ],
            },
            LessonPlanStep {
                id: "step-compare".to_owned(),
                sequence: 2,
                role: LessonStepRole::Core,
                title: "Compare fractions".to_owned(),
                summary: "Use position on a number line to compare two fractions.".to_owned(),
                duration_minutes: 13,
                lesson_objective_id: Some("lesson-objective-compare".to_owned()),
                knowledge_type: Some(KnowledgeType::Concept),
                teacher_activities: vec!["Model how position shows which fraction is greater.".to_owned()],
                learner_activities: vec!["Place fraction cards on a shared number line.".to_owned()],
                blocks: vec![
                    explanation(
                        "block-compare-explanation",
                        "A fraction farther to the right on the same number line is greater.",
                    ),
                    practice(
                        "block-compare-practice",
                        "lesson-objective-compare",
                        "Which is greater on a number line: 2/5 or 3/5?",
                        "3/5",
                    ),
                ],
            },
            LessonPlanStep {
                id: "step-order".to_owned(),
                sequence: 3,
                role: LessonStepRole::Core,
                title: "Order unlike fractions".to_owned(),
                summary: "Find a common denominator and compare the numerators.".to_owned(),
                duration_minutes: 20,
                lesson_objective_id: Some("lesson-objective-order".to_owned()),
                knowledge_type: Some(KnowledgeType::Procedure),
                teacher_activities: vec!["Work through one ordering example and explain every conversion.".to_owned()],
                learner_activities: vec!["Complete a parallel ordering problem and explain the order.".to_owned()],
                blocks: vec![
                    explanation("block-order-explanation", "Equivalent fractions allow unlike fractions to be compared in equal-sized parts."),
                    LessonContentBlock::WorkedExample {
                        id: "block-order-example".to_owned(),
                        problem: "Order 1/2, 2/3 and 3/4 from least to greatest.".to_owned(),
                        steps: vec![
                            WorkedExampleStep { label: "Find a shared denominator".to_owned(), content: "The least common multiple of 2, 3 and 4 is 12.".to_owned() },
                            WorkedExampleStep { label: "Rewrite and compare".to_owned(), content: "1/2 = 6/12, 2/3 = 8/12 and 3/4 = 9/12.".to_owned() },
                        ],
                        final_answer: "1/2 < 2/3 < 3/4".to_owned(),
                    },
                    practice("block-order-practice", "lesson-objective-order", "Order 3/5, 1/2 and 3/4 from least to greatest.", "1/2 < 3/5 < 3/4"),
                ],
            },
            LessonPlanStep {
                id: "step-evaluation".to_owned(),
                sequence: 4,
                role: LessonStepRole::Evaluation,
                title: "Check today's learning".to_owned(),
                summary: "Assess comparison and ordering independently.".to_owned(),
                duration_minutes: 10,
                lesson_objective_id: None,
                knowledge_type: None,
                teacher_activities: vec!["Give both questions and review the stated reasoning.".to_owned()],
                learner_activities: vec!["Answer both questions independently and show the comparison method.".to_owned()],
                blocks: vec![
                    practice("block-evaluation-compare", "lesson-objective-compare", "Which is greater: 3/8 or 5/8?", "5/8"),
                    practice("block-evaluation-order", "lesson-objective-order", "Order 1/3, 3/5 and 1/2.", "1/3 < 1/2 < 3/5"),
                ],
            },
        ];
        let evidence = SourceEvidenceSnapshot {
            records: vec![
                SourceEvidenceRecord {
                    record_id: "record-fraction-model".to_owned(),
                    title: "Fraction models".to_owned(),
                    excerpt: "A number line represents fractions as positions between whole numbers.".to_owned(),
                    excerpt_sha256: digest("A number line represents fractions as positions between whole numbers."),
                    attribution: "Siyavula Mathematics".to_owned(),
                },
                SourceEvidenceRecord {
                    record_id: "record-ordering-fractions".to_owned(),
                    title: "Ordering fractions".to_owned(),
                    excerpt: "Rewrite unlike fractions with a common denominator before comparing their numerators.".to_owned(),
                    excerpt_sha256: digest("Rewrite unlike fractions with a common denominator before comparing their numerators."),
                    attribution: "Siyavula Mathematics".to_owned(),
                },
            ],
            figures: vec![SourceEvidenceFigure {
                source_record_id: "record-fraction-model".to_owned(),
                asset_file_name: "fraction-number-line.png".to_owned(),
                sha256: "a".repeat(64),
                caption: "Fractions placed on a number line.".to_owned(),
                alt_text: "A number line from zero to one marked in equal fraction intervals.".to_owned(),
            }],
        };
        let plan = GranularLessonPlan {
            schema_version: 1,
            topic: "Ordering fractions".to_owned(),
            subtopic: Some("Unlike denominators".to_owned()),
            curriculum_objectives: curriculum_objectives.clone(),
            atomic_objectives: atomic_objectives.clone(),
            lesson_objectives,
            knowledge_components: knowledge_components.clone(),
            misconceptions: vec![Misconception {
                id: "misconception-denominator".to_owned(),
                statement: "A larger denominator always means a larger fraction.".to_owned(),
                correction: "The denominator names the number of equal parts; more equal parts make each part smaller when numerators are equal.".to_owned(),
                knowledge_component_ids: vec!["knowledge-compare".to_owned()],
                supporting_record_ids: vec!["record-fraction-model".to_owned()],
            }],
            prior_knowledge: vec![PriorKnowledgeItem {
                id: "prior-fraction-model".to_owned(),
                statement: "Learners can identify equal parts of one whole.".to_owned(),
                knowledge_component_ids: vec!["knowledge-fraction-model".to_owned()],
                supporting_record_ids: vec!["record-fraction-model".to_owned()],
            }],
            instructional_materials: vec!["Fraction cards".to_owned(), "Number-line strip".to_owned()],
            references: evidence.records.iter().map(|record| LessonReference {
                record_id: record.record_id.clone(),
                title: record.title.clone(),
                attribution: record.attribution.clone(),
            }).collect(),
            steps,
            assessments: vec![
                AssessmentItem {
                    id: "assessment-compare".to_owned(),
                    lesson_objective_id: "lesson-objective-compare".to_owned(),
                    knowledge_component_id: "knowledge-compare".to_owned(),
                    question: "Which is greater: 3/8 or 5/8? Explain.".to_owned(),
                    expected_answer: "5/8 because equal eighths are compared by their numerators.".to_owned(),
                    bloom_level: BloomLevel::Understand,
                    rubric: vec!["Selects 5/8.".to_owned(), "Explains the comparison using equal-sized parts or the number line.".to_owned()],
                    supporting_record_ids: vec!["record-fraction-model".to_owned()],
                },
                AssessmentItem {
                    id: "assessment-order".to_owned(),
                    lesson_objective_id: "lesson-objective-order".to_owned(),
                    knowledge_component_id: "knowledge-order".to_owned(),
                    question: "Order 1/3, 3/5 and 1/2 from least to greatest.".to_owned(),
                    expected_answer: "1/3 < 1/2 < 3/5".to_owned(),
                    bloom_level: BloomLevel::Apply,
                    rubric: vec!["Uses a valid common representation.".to_owned(), "States the correct order.".to_owned()],
                    supporting_record_ids: vec!["record-ordering-fractions".to_owned()],
                },
            ],
        };
        GranularLessonRecord {
            curriculum_snapshot: CurriculumSnapshot {
                package_id: Some("curriculum-ng-mathematics".to_owned()),
                package_title: Some("Nigeria Basic Education Mathematics".to_owned()),
                package_sha256: Some("b".repeat(64)),
                course_id: Some("course-jss1-mathematics".to_owned()),
                curriculum_node_id: Some("node-fractions".to_owned()),
                objectives: curriculum_objectives,
                atomic_objectives,
                knowledge_components,
            },
            source_evidence_snapshot: evidence,
            program_snapshot: LessonProgramSnapshot {
                program_id: "lesson-plan.granular".to_owned(),
                program_version: "1.0.0".to_owned(),
                program_digest: "c".repeat(64),
                program_run_id: Some("run-ordering-fractions".to_owned()),
            },
            plan,
        }
    }

    /// The wrong answer that reached a real teacher's confirmed library:
    /// 500,000,000 written out as "One hundred million". It is reported rather
    /// than refused — five of this teacher's nine drafts carry an answer like
    /// it, and blocking the save would stop them editing their own work.
    #[test]
    fn a_provably_wrong_answer_is_reported_and_does_not_block_the_save() {
        let mut record = granular_record();
        record.plan.assessments[0].question =
            "Write the number 500,000,000 in words, using place value.".to_owned();
        record.plan.assessments[0].expected_answer = "One hundred million".to_owned();

        record
            .validate_complete()
            .expect("a teacher's edit is not blocked by an answer already there");

        let report = answer_report(&record.plan);
        let named = report
            .wrong
            .iter()
            .find(|wrong| wrong.question.contains("500,000,000"))
            .expect("the wrong answer is named");
        assert!(named.problem.contains("100,000,000"), "{}", named.problem);
    }

    #[test]
    fn accepts_a_complete_nigeria_ordering_fractions_lesson() {
        assert_eq!(granular_record().validate_complete(), Ok(()));
    }

    #[test]
    fn accepts_a_lesson_the_teacher_wrote_without_a_curriculum() {
        let mut record = granular_record();
        record.curriculum_snapshot.package_id = None;
        record.curriculum_snapshot.package_title = None;
        record.curriculum_snapshot.package_sha256 = None;
        record.curriculum_snapshot.course_id = None;
        record.curriculum_snapshot.curriculum_node_id = None;

        assert_eq!(record.validate_complete(), Ok(()));
        assert!(record.curriculum_snapshot.package_id.is_none());
    }

    #[test]
    fn rejects_a_lesson_that_names_its_curriculum_only_in_part() {
        let mut record = granular_record();
        record.curriculum_snapshot.package_sha256 = None;

        let errors = record
            .validate_complete()
            .expect_err("half-named provenance cannot be trusted");

        assert!(
            errors.iter().any(|error| error.contains("only in part")),
            "unexpected errors: {errors:?}",
        );
    }

    #[test]
    fn rejects_a_saved_lesson_with_prerequisite_only_ordering_practice() {
        let mut record = granular_record();
        let ordering_step = record
            .plan
            .steps
            .iter_mut()
            .find(|step| step.id == "step-order")
            .expect("ordering step");
        ordering_step
            .blocks
            .retain(|block| !matches!(block, LessonContentBlock::Practice { .. }));
        ordering_step.blocks.push(LessonContentBlock::Practice {
            id: "block-order-practice".to_owned(),
            lesson_objective_id: "lesson-objective-order".to_owned(),
            question: "Find the LCM of 2, 3, and 4.".to_owned(),
            expected_answer: "The LCM is 12.".to_owned(),
            hints: vec!["List the multiples.".to_owned()],
        });

        let errors = record.validate_complete().expect_err("practice must fail");

        assert!(errors
            .iter()
            .any(|error| error.contains("must ask learners to order fractions")));
    }

    #[test]
    fn rejects_a_saved_lesson_with_hints_from_a_different_problem() {
        let mut record = granular_record();
        let ordering_practice = record
            .plan
            .steps
            .iter_mut()
            .flat_map(|step| &mut step.blocks)
            .find(|block| {
                matches!(
                    block,
                    LessonContentBlock::Practice { id, .. } if id == "block-order-practice"
                )
            })
            .expect("ordering practice");
        if let LessonContentBlock::Practice { hints, .. } = ordering_practice {
            *hints = vec!["Find the LCM of the denominators (2, 3, 4).".to_owned()];
        }

        let errors = record.validate_complete().expect_err("hints must fail");

        assert!(errors.iter().any(|error| error
            .contains("hint names denominators that do not match its practice question")));
    }

    #[test]
    fn rejects_a_prerequisite_cycle() {
        let mut record = granular_record();
        record.plan.knowledge_components[0].prerequisite_knowledge_component_ids =
            vec!["knowledge-order".to_owned()];
        record.curriculum_snapshot.knowledge_components = record.plan.knowledge_components.clone();

        let errors = record.validate_complete().expect_err("cycle must fail");
        assert!(errors
            .iter()
            .any(|error| error.contains("must not contain a cycle")));
    }

    #[test]
    fn rejects_a_procedure_without_a_worked_example() {
        let mut record = granular_record();
        record.plan.steps[2]
            .blocks
            .retain(|block| !matches!(block, LessonContentBlock::WorkedExample { .. }));

        let errors = record
            .validate_complete()
            .expect_err("missing block must fail");
        assert!(errors
            .iter()
            .any(|error| error.contains("need a worked example")));
    }

    #[test]
    fn reports_an_incorrect_fraction_ordering_answer_without_blocking_the_save() {
        let mut record = granular_record();
        record.plan.assessments[1].question =
            "Order 1/3, 1/4, and 1/6 from least to greatest.".to_owned();
        record.plan.assessments[1].expected_answer = "1/6, 1/3, 1/4".to_owned();

        record
            .validate_complete()
            .expect("a teacher's edit is not blocked by arithmetic already in the lesson");

        assert!(answer_report(&record.plan)
            .wrong
            .iter()
            .any(|wrong| wrong.question.contains("Order 1/3")));
    }

    #[test]
    fn rejects_a_visual_that_was_not_resolved_from_saved_evidence() {
        let mut record = granular_record();
        if let LessonContentBlock::Visual { figure_sha256, .. } =
            &mut record.plan.steps[0].blocks[1]
        {
            *figure_sha256 = "d".repeat(64);
        }

        let errors = record
            .validate_complete()
            .expect_err("unverified visual must fail");
        assert!(errors
            .iter()
            .any(|error| error.contains("verified source figure")));
    }

    #[test]
    fn rejects_a_curriculum_snapshot_changed_after_generation() {
        let mut record = granular_record();
        record.plan.atomic_objectives[0].statement = "A changed objective".to_owned();

        let errors = record
            .validate_complete()
            .expect_err("snapshot drift must fail");
        assert!(errors
            .iter()
            .any(|error| error.contains("curriculum snapshot")));
    }

    #[test]
    fn rejects_an_objective_without_its_core_step() {
        let mut record = granular_record();
        record.plan.steps.remove(1);
        for (index, step) in record.plan.steps.iter_mut().enumerate() {
            step.sequence = u16::try_from(index + 1).expect("small fixture");
        }

        let errors = record
            .validate_complete()
            .expect_err("missing core must fail");
        assert!(errors
            .iter()
            .any(|error| error.contains("at least one core lesson step")));
    }

    #[test]
    fn accepts_multiple_core_steps_for_one_lesson_objective() {
        let mut record = granular_record();
        let mut added = record.plan.steps[2].clone();
        added.id = "step-order-guided-practice".to_owned();
        added.sequence = 4;
        added.title = "Guide fraction ordering practice".to_owned();
        for block in &mut added.blocks {
            match block {
                LessonContentBlock::Explanation { id, .. }
                | LessonContentBlock::WorkedExample { id, .. }
                | LessonContentBlock::Practice { id, .. }
                | LessonContentBlock::Visual { id, .. } => {
                    *id = format!("guided-{id}");
                }
            }
        }
        record.plan.steps.insert(3, added);
        record.plan.steps[4].sequence = 5;

        assert_eq!(record.validate_complete(), Ok(()));
    }

    #[test]
    fn accepts_multiple_aligned_assessment_questions_for_one_objective() {
        let mut record = granular_record();
        let mut assessment = record.plan.assessments[0].clone();
        assessment.id = "assessment-compare-second".to_owned();
        assessment.question = "Which is greater: 2/7 or 5/7? Explain.".to_owned();
        assessment.expected_answer =
            "5/7 because equal sevenths are compared by their numerators.".to_owned();
        record.plan.assessments.push(assessment);
        let evaluation = record.plan.steps.last_mut().expect("evaluation step");
        evaluation.blocks.push(LessonContentBlock::Practice {
            id: "block-evaluation-compare-second".to_owned(),
            lesson_objective_id: "lesson-objective-compare".to_owned(),
            question: "Which is greater: 2/7 or 5/7? Explain.".to_owned(),
            expected_answer: "5/7".to_owned(),
            hints: Vec::new(),
        });

        assert_eq!(record.validate_complete(), Ok(()));
    }

    #[test]
    fn rejects_duplicate_assessment_references() {
        let mut record = granular_record();
        record
            .plan
            .assessments
            .push(record.plan.assessments[0].clone());

        let errors = record
            .validate_complete()
            .expect_err("duplicate assessment reference must fail");

        assert!(errors
            .iter()
            .any(|error| error.contains("Assessment references")));
    }

    #[test]
    fn strict_json_rejects_unknown_lesson_fields() {
        let mut value = serde_json::to_value(granular_record()).expect("serialize fixture");
        value["plan"]["researchIdentifier"] = serde_json::json!("LO-1");

        assert!(serde_json::from_value::<GranularLessonRecord>(value).is_err());
    }
}
