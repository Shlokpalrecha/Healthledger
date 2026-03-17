"""POST /explain endpoint"""

from fastapi import APIRouter
from api.schemas import HealthInputs
from models.risk_model import risk_models

router = APIRouter()


@router.post("/explain")
def explain(inputs: HealthInputs):
    shap_vals = risk_models.shap_values(inputs.model_dump())
    return shap_vals
