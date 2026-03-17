"""Risk prediction and explainability logic for HealthLedger AI."""

import json
import os

import numpy as np
import shap
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cost_data.json")
with open(DATA_PATH, encoding="utf-8") as file:
    COST_DATA = json.load(file)


def _generate_synthetic_data(n=3000, seed=42):
    """Generate synthetic but clinically plausible training data."""
    rng = np.random.default_rng(seed)

    age = rng.uniform(18, 80, n)
    bmi = rng.uniform(16, 45, n)
    smoking = rng.integers(0, 2, n)
    alcohol = rng.integers(0, 2, n)
    exercise = rng.uniform(0, 7, n)
    family_history = rng.integers(0, 2, n)

    X = np.column_stack([age, bmi, smoking, alcohol, exercise, family_history])

    log_odds_d = (
        -7.2
        + 0.052 * age
        + 0.11 * bmi
        + 0.68 * smoking
        + 0.26 * alcohol
        - 0.24 * exercise
        + 0.85 * family_history
        + rng.normal(0, 0.4, n)
    )
    y_diabetes = (rng.uniform(0, 1, n) < 1 / (1 + np.exp(-log_odds_d))).astype(int)

    log_odds_h = (
        -8.1
        + 0.064 * age
        + 0.094 * bmi
        + 0.94 * smoking
        + 0.38 * alcohol
        - 0.22 * exercise
        + 1.02 * family_history
        + rng.normal(0, 0.4, n)
    )
    y_heart = (rng.uniform(0, 1, n) < 1 / (1 + np.exp(-log_odds_h))).astype(int)

    log_odds_bp = (
        -6.1
        + 0.045 * age
        + 0.13 * bmi
        + 0.48 * smoking
        + 0.42 * alcohol
        - 0.18 * exercise
        + 0.74 * family_history
        + rng.normal(0, 0.4, n)
    )
    y_hyp = (rng.uniform(0, 1, n) < 1 / (1 + np.exp(-log_odds_bp))).astype(int)

    return X, y_diabetes, y_heart, y_hyp


FEATURE_NAMES = ["age", "bmi", "smoking", "alcohol", "exercise", "family_history"]


class RiskModels:
    def __init__(self):
        self.scaler = StandardScaler()
        self.models = {}
        self.explainers = {}
        self.reference_samples = None
        self._train()

    def _train(self):
        X, y_d, y_h, y_bp = _generate_synthetic_data()
        X_scaled = self.scaler.fit_transform(X)
        self.reference_samples = X_scaled[:500]

        diseases = {"diabetes": y_d, "heart_disease": y_h, "hypertension": y_bp}
        for name, y in diseases.items():
            clf = LogisticRegression(max_iter=500, random_state=42)
            clf.fit(X_scaled, y)
            self.models[name] = clf
            self.explainers[name] = shap.LinearExplainer(clf, self.reference_samples)

    def predict(self, inputs: dict) -> dict:
        x = self._to_array(inputs)
        x_scaled = self.scaler.transform(x)
        result = {}
        for name, clf in self.models.items():
            prob = float(clf.predict_proba(x_scaled)[0][1])
            result[name] = round(prob, 4)
        return result

    def shap_values(self, inputs: dict) -> dict:
        x = self._to_array(inputs)
        x_scaled = self.scaler.transform(x)
        per_disease = {}
        aggregate = {feature: 0.0 for feature in FEATURE_NAMES}

        for name, explainer in self.explainers.items():
            explanation = explainer(x_scaled)
            shap_row = explanation.values[0]
            feature_scores = {
                feature: round(float(abs(value)), 4)
                for feature, value in zip(FEATURE_NAMES, shap_row)
            }
            per_disease[name] = feature_scores
            for feature, value in feature_scores.items():
                aggregate[feature] += value

        overall = {
            feature: round(value / len(per_disease), 4)
            for feature, value in aggregate.items()
        }
        ranked = [
            {"feature": feature, "importance": importance}
            for feature, importance in sorted(
                overall.items(), key=lambda item: item[1], reverse=True
            )
        ]
        return {
            "overall_importance": ranked,
            "per_disease": per_disease,
        }

    def health_impact(self, inputs: dict, predictions: dict) -> dict:
        resilience_score = np.clip(
            84
            - max(inputs["age"] - 35, 0) * 0.42
            - max(inputs["bmi"] - 24, 0) * 1.35
            - inputs["smoking"] * 16
            - inputs["alcohol"] * 6
            + inputs["exercise"] * 2.8
            - inputs["family_history"] * 8,
            8,
            96,
        )

        burden_breakdown = {}
        expected_treatment_burden = 0.0
        for disease, probability in predictions.items():
            cost_profile = COST_DATA[disease]
            burden = probability * (
                cost_profile["annual_cost"] * 1.9 + cost_profile["event_cost"] * 0.16
            )
            burden_breakdown[disease] = round(float(burden), 2)
            expected_treatment_burden += burden

        preparedness_buffer = 600000 + resilience_score * 15000
        preparedness_gap = max(expected_treatment_burden - preparedness_buffer, 0)
        risk_pressure = float(np.mean(list(predictions.values())) * 100)

        return {
            "expected_treatment_burden": round(float(expected_treatment_burden), 2),
            "preparedness_gap": round(float(preparedness_gap), 2),
            "resilience_score": round(float(resilience_score), 1),
            "risk_pressure": round(risk_pressure, 1),
            "disease_burden": burden_breakdown,
        }

    def _to_array(self, inputs: dict) -> np.ndarray:
        return np.array([[
            inputs["age"],
            inputs["bmi"],
            inputs["smoking"],
            inputs["alcohol"],
            inputs["exercise"],
            inputs["family_history"],
        ]])


risk_models = RiskModels()
