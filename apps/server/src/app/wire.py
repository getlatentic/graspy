from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Wire(BaseModel):
    """camelCase JSON, the app's convention."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, frozen=True
    )
