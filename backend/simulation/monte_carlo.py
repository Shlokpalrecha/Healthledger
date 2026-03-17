import json
import os

import numpy as np

COST_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cost_data.json")
with open(COST_DATA_PATH, encoding="utf-8") as f:
    COST_DATA = json.load(f)

N_SIMS = 1000
YEARS = 12
DURATION = list(range(1, YEARS + 1))
SEVERITY_WEIGHTS = {"diabetes": 0.9, "heart_disease": 1.35, "hypertension": 0.7}


def run_simulation(base_probs: dict, inputs: dict) -> dict:
    rng = np.random.default_rng(42)
    disease_outlooks = {}
    portfolio_risk = np.zeros((N_SIMS, YEARS))
    portfolio_cost = np.zeros((N_SIMS, YEARS))
    total_events = np.zeros(N_SIMS)

    prevention_effect = (
        inputs["exercise"] * 0.015
        - inputs["smoking"] * 0.05
        - inputs["alcohol"] * 0.02
        - max(inputs["bmi"] - 25, 0) * 0.003
    )

    for disease, base_prob in base_probs.items():
        cost_info = COST_DATA[disease]
        severity_weight = SEVERITY_WEIGHTS[disease]
        disease_probabilities = np.zeros((N_SIMS, YEARS))
        disease_costs = np.zeros((N_SIMS, YEARS))
        disease_events = np.zeros((N_SIMS, YEARS))

        for simulation_index in range(N_SIMS):
            noise = rng.normal(0, 0.026, YEARS)
            trend = np.linspace(0, 0.08 + max(inputs["age"] - 45, 0) * 0.0008, YEARS)
            annual_probs = np.clip(base_prob + trend - prevention_effect + noise, 0.01, 0.99)
            event_draws = rng.binomial(1, annual_probs)
            severity_draws = rng.choice(cost_info["severity_multiplier"], size=YEARS, p=[0.6, 0.28, 0.12])
            annual_variability = rng.lognormal(mean=0.0, sigma=0.18, size=YEARS)

            annual_costs = (
                cost_info["annual_cost"] * annual_variability * (0.45 + annual_probs)
                + event_draws * cost_info["event_cost"] * severity_draws
            )

            disease_probabilities[simulation_index] = annual_probs
            disease_costs[simulation_index] = annual_costs
            disease_events[simulation_index] = event_draws

        expected_prob = np.percentile(disease_probabilities, 50, axis=0)
        best_prob = np.percentile(disease_probabilities, 10, axis=0)
        worst_prob = np.percentile(disease_probabilities, 90, axis=0)

        disease_outlooks[disease] = {
            "best_case": [round(float(value), 4) for value in best_prob],
            "expected_case": [round(float(value), 4) for value in expected_prob],
            "worst_case": [round(float(value), 4) for value in worst_prob],
            "event_probability": round(float(np.mean(np.any(disease_events > 0, axis=1))), 4),
            "cumulative_cost_best": round(float(np.percentile(np.sum(disease_costs, axis=1), 10)), 2),
            "cumulative_cost_expected": round(float(np.percentile(np.sum(disease_costs, axis=1), 50)), 2),
            "cumulative_cost_worst": round(float(np.percentile(np.sum(disease_costs, axis=1), 90)), 2),
        }

        portfolio_risk += disease_probabilities * severity_weight * 100
        portfolio_cost += disease_costs
        total_events += np.sum(disease_events, axis=1)

    scenarios = []
    for index, year in enumerate(DURATION):
        yearly_risk = portfolio_risk[:, index]
        yearly_cost = portfolio_cost[:, index]
        best_case = np.percentile(yearly_risk, 10)
        expected_case = np.percentile(yearly_risk, 50)
        worst_case = np.percentile(yearly_risk, 90)
        scenarios.append(
            {
                "year": year,
                "best_case": round(float(best_case), 2),
                "expected_case": round(float(expected_case), 2),
                "worst_case": round(float(worst_case), 2),
                "range_band": round(float(worst_case - best_case), 2),
                "expected_cost": round(float(np.percentile(yearly_cost, 50)), 2),
            }
        )

    total_costs = np.sum(portfolio_cost, axis=1)
    total_risk = np.mean(portfolio_risk, axis=1)

    best_case_total = float(np.percentile(total_costs, 10))
    expected_case_total = float(np.percentile(total_costs, 50))
    worst_case_total = float(np.percentile(total_costs, 90))

    return {
        "timeline": DURATION,
        "scenarios": scenarios,
        "diseases": disease_outlooks,
        "summary": {
            "best_case": round(best_case_total, 2),
            "expected_case": round(expected_case_total, 2),
            "worst_case": round(worst_case_total, 2),
            "best_case_cost": round(best_case_total, 2),
            "expected_case_cost": round(expected_case_total, 2),
            "worst_case_cost": round(worst_case_total, 2),
            "expected_events": round(float(np.mean(total_events)), 2),
            "risk_outlook": round(float(np.percentile(total_risk, 50)), 2),
        },
    }
