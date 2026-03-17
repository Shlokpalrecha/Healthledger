"""POST /predict endpoint"""

from fastapi import APIRouter
from api.schemas import HealthInputs
from models.risk_model import risk_models

router = APIRouter()


@router.post("/predict")
def predict(inputs: HealthInputs):
    payload = inputs.model_dump()
    probs = risk_models.predict(payload)
    impact = risk_models.health_impact(payload, probs)
    return {
        "diabetes_probability": probs["diabetes"],
        "heart_disease_probability": probs["heart_disease"],
        "hypertension_probability": probs["hypertension"],
        "health_impact": impact,
    }
