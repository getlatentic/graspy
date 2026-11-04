"""The tutor's tools that a resumed turn may call again: each only reads, or hands the app an action to
carry out, and changes nothing the server keeps."""

READ_ONLY_TOOLS = frozenset(
    {
        "calculate",
        "open_subject",
        "open_topic",
        "add_topic",
        "propose_path",
        "change_subjects",
        "rebuild_plan",
        "give_practice",
        "give_passage",
    }
)
