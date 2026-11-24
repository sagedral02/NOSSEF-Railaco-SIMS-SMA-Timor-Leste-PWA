"""File authorization registry (INV-16: private files are never anonymous by default).

Each domain module registers a resolver `fn(user, file) -> bool | None` that answers for files it references.
A file is readable when any resolver returns True. Unattached temporary uploads are readable by their uploader.
"""

_resolvers = []


def register(fn):
    _resolvers.append(fn)
    return fn


def can_read(user, file):
    if not user or not user.is_authenticated:
        return False
    if not file.attached and file.uploaded_by_id == user.pk:
        return True
    return any(resolver(user, file) for resolver in _resolvers)
