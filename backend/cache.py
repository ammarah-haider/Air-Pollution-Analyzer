import time

_store = {}


def get(key, max_age):
    hit = _store.get(key)
    if hit and time.time() - hit[0] < max_age:
        return hit[1]
    return None


def put(key, value):
    _store[key] = (time.time(), value)
