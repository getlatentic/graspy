//! Correcting a score the machine awarded itself.
//!
//! A quality number should be a claim someone checked. A reviewer reads what a
//! criterion was scored on and says what it should have been, and from then on
//! that is the number the run is read at and promoted on.
//!
//! Corrections are kept beside the scores rather than written over them. A
//! scorer a person keeps overruling is the thing worth finding, and an
//! overwritten score hides it.

use std::collections::BTreeMap;

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::Database;

use super::{
    now_ms, persistence_fault, registration_fault, EvaluationSuite, RuntimeFault,
};

/// What a reviewer says a criterion should have scored, and why.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Correction {
    pub case_key: String,
    pub metric: String,
    pub score: f64,
    pub reviewer: String,
    pub because: String,
}

/// A run's criteria once every correction has been applied — the reading that
/// counts, and the one promotion is decided on.
#[derive(Debug, Clone, PartialEq)]
pub struct ReviewedRun {
    pub aggregate: BTreeMap<String, f64>,
    pub cases_below_threshold: usize,
    pub corrections: usize,
}

/// Records what a reviewer says a criterion should have scored.
///
/// The correction is kept beside the score rather than written over it, so a
/// scorer a person keeps overruling stays visible.
pub fn review(
    database: &Database,
    evaluation_run_id: &str,
    correction: &Correction,
) -> Result<(), RuntimeFault> {
    if !(0.0..=1.0).contains(&correction.score) || !correction.score.is_finite() {
        return Err(registration_fault(
            "A reviewed score has to be between zero and one.",
        ));
    }
    let case_id = database
        .with_connection(|connection| {
            connection
                .query_row(
                    "SELECT id FROM generation_evaluation_cases
                     WHERE evaluation_run_id = ?1 AND case_key = ?2",
                    params![evaluation_run_id, correction.case_key],
                    |row| row.get::<_, String>(0),
                )
                .optional()
        })
        .map_err(persistence_fault)?
        .ok_or_else(|| registration_fault("That case is not in this evaluation run."))?;
    database
        .with_connection(|connection| {
            connection.execute(
                "INSERT INTO generation_evaluation_reviews (
                    id, evaluation_case_id, metric, score, reviewer, because, reviewed_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    Uuid::new_v4().to_string(),
                    case_id,
                    correction.metric,
                    correction.score,
                    correction.reviewer.trim(),
                    correction.because.trim(),
                    now_ms(),
                ],
            )
        })
        .map_err(persistence_fault)?;
    Ok(())
}

/// A run read back with every reviewer's correction in place of the score it
/// corrects, the latest correction standing where there is more than one.
///
/// A case counts as passing when its reviewed scores meet every threshold. That
/// is the whole rule: a criterion the scorer could not return is a zero until
/// somebody looks at it and says otherwise.
pub fn after_review(
    database: &Database,
    suite: &EvaluationSuite,
    evaluation_run_id: &str,
) -> Result<ReviewedRun, RuntimeFault> {
    let cases = database
        .with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT id, scores_json FROM generation_evaluation_cases
                 WHERE evaluation_run_id = ?1",
            )?;
            let rows = statement
                .query_map([evaluation_run_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok::<_, rusqlite::Error>(rows)
        })
        .map_err(persistence_fault)?;

    let mut totals = suite
        .thresholds
        .iter()
        .map(|threshold| (threshold.metric.clone(), 0.0))
        .collect::<BTreeMap<String, f64>>();
    let mut cases_below_threshold = 0;
    let mut corrections = 0;
    for (case_id, scores_json) in &cases {
        let mut scores: BTreeMap<String, f64> = scores_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(persistence_fault)?
            .unwrap_or_default();
        for (metric, reviewed) in latest_reviews(database, case_id)? {
            scores.insert(metric, reviewed);
            corrections += 1;
        }
        let met = suite.thresholds.iter().all(|threshold| {
            scores.get(&threshold.metric).copied().unwrap_or(0.0) >= threshold.minimum
        });
        if !met {
            cases_below_threshold += 1;
        }
        for (metric, total) in &mut totals {
            *total += scores.get(metric).copied().unwrap_or(0.0);
        }
    }

    let case_count = cases.len().max(1) as f64;
    Ok(ReviewedRun {
        aggregate: totals
            .into_iter()
            .map(|(metric, total)| (metric, total / case_count))
            .collect(),
        cases_below_threshold,
        corrections,
    })
}

/// The correction that stands for each criterion of one case.
fn latest_reviews(
    database: &Database,
    evaluation_case_id: &str,
) -> Result<BTreeMap<String, f64>, RuntimeFault> {
    database
        .with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT metric, score FROM generation_evaluation_reviews
                 WHERE evaluation_case_id = ?1
                 ORDER BY reviewed_at_ms ASC, rowid ASC",
            )?;
            let rows = statement
                .query_map([evaluation_case_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
                })?
                .collect::<rusqlite::Result<BTreeMap<_, _>>>()?;
            Ok::<_, rusqlite::Error>(rows)
        })
        .map_err(persistence_fault)
}
