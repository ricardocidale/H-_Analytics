"""
Single source of truth for the canonical L+B Property Slides PPTX template.

To swap to a new canonical template, change CANONICAL_PPTX_FILENAME below and
move any superseded files into attached_assets/archive/. All Python scripts
that read the template (generate_property_slides.py, extract_slot_recipe.py,
render_slide_backgrounds.py, plus any future tooling) import from here, so
this is the only line that needs to change.
"""

from pathlib import Path

CANONICAL_PPTX_FILENAME = "L+B_Property_Slides_02_1777743268816.pptx"

WORKSPACE_ROOT = Path(__file__).parent.parent.parent
CANONICAL_PPTX_PATH = WORKSPACE_ROOT / "attached_assets" / CANONICAL_PPTX_FILENAME
