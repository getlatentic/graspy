"""Arithmetic for the calculate tool. The model repeats what a learner types,
so the input is hostile: it is parsed and walked against an allowlist of node
types, never handed to ``eval``. An allowlist of names alone would pass a
payload wrapped in a lambda, whose ``co_names`` is empty."""

from __future__ import annotations

import ast
import math
import operator
from collections.abc import Callable
from typing import Any

_BINARY_OPS: dict[type[ast.operator], Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY_OPS: dict[type[ast.unaryop], Callable[[Any], Any]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_CONSTANTS = {
    name: value for name, value in vars(math).items() if isinstance(value, float)
}

_FUNCTIONS: dict[str, Callable[..., Any]] = {
    name: value for name, value in vars(math).items() if callable(value)
}
_FUNCTIONS |= {"abs": abs, "round": round, "min": min, "max": max}

# About 3,000 digits: under the 4,300 Python will print, and small enough
# that no operation on such integers is expensive.
_MAX_INTEGER_BITS = 10_000

# Bits in the result, estimated before the operations whose result can dwarf
# their inputs: computing it is itself the cost, minutes of CPU and hundreds
# of megabytes for a short expression.
_GROWTH: dict[str, Callable[..., float]] = {
    "pow": lambda base, exponent: (
        exponent * math.log2(abs(base)) if abs(base) > 1 else 0
    ),
    "factorial": lambda n: n * n.bit_length(),
    "comb": lambda n, k: min(k, n - k) * n.bit_length(),
    "perm": lambda n, k=None: (n if k is None else k) * n.bit_length(),
}

_MAX_EXPRESSION_LENGTH = 500

# On a Worker, deep recursion can overflow the WebAssembly stack before
# Python's own limit stops it.
_MAX_DEPTH = 50


class CalculationError(ValueError):
    pass


def _check_growth(name: str, arguments: list) -> None:
    estimate = _GROWTH.get(name)
    if estimate is None or not all(type(argument) is int for argument in arguments):
        return
    try:
        bits = estimate(*arguments)
    except TypeError:
        return  # The wrong number of arguments, which the function reports.
    except OverflowError:
        bits = math.inf
    if bits > _MAX_INTEGER_BITS:
        raise CalculationError(f"{name} would give a number too large to work with")


def _depth(tree: ast.AST) -> int:
    # Without recursion, so measuring cannot overflow either.
    deepest, pending = 0, [(tree, 1)]
    while pending:
        node, depth = pending.pop()
        deepest = max(deepest, depth)
        pending.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
    return deepest


def _bounded(value: Any) -> Any:
    if isinstance(value, int) and value.bit_length() > _MAX_INTEGER_BITS:
        raise CalculationError("the result is too large to work with")
    return value


class _Evaluator(ast.NodeVisitor):
    def generic_visit(self, node: ast.AST) -> Any:
        raise CalculationError(f"{type(node).__name__} is not allowed here")

    def visit_Expression(self, node: ast.Expression) -> Any:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> Any:
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise CalculationError("only numbers are allowed")
        return node.value

    def visit_Name(self, node: ast.Name) -> Any:
        if node.id not in _CONSTANTS:
            raise CalculationError(f"unknown name {node.id!r}")
        return _CONSTANTS[node.id]

    def visit_Attribute(self, node: ast.Attribute) -> Any:
        """Only ``math.<constant>``: a call's ``math.`` prefix is stripped
        before its func is visited."""
        if not isinstance(node.value, ast.Name) or node.value.id != "math":
            raise CalculationError("attribute access is not allowed here")
        if node.attr not in _CONSTANTS:
            raise CalculationError(f"unknown constant {node.attr!r}")
        return _CONSTANTS[node.attr]

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        apply = _BINARY_OPS.get(type(node.op))
        if apply is None:
            raise CalculationError(f"{type(node.op).__name__} is not allowed")

        left, right = self.visit(node.left), self.visit(node.right)
        if isinstance(node.op, ast.Pow):
            _check_growth("pow", [left, right])
        return _bounded(apply(left, right))

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        apply = _UNARY_OPS.get(type(node.op))
        if apply is None:
            raise CalculationError(f"{type(node.op).__name__} is not allowed")
        return apply(self.visit(node.operand))

    def visit_Call(self, node: ast.Call) -> Any:
        if node.keywords:
            raise CalculationError("keyword arguments are not allowed")

        name = self._callable_name(node.func)
        function = _FUNCTIONS.get(name)
        if function is None:
            raise CalculationError(f"unknown function {name!r}")

        arguments = [self.visit(argument) for argument in node.args]
        _check_growth(name, arguments)
        return _bounded(function(*arguments))

    def _callable_name(self, func: ast.expr) -> str:
        if isinstance(func, ast.Name):
            return func.id
        if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
            if func.value.id != "math":
                raise CalculationError(f"unknown module {func.value.id!r}")
            return func.attr
        raise CalculationError("expression is not a direct function call")


def evaluate(expression: str) -> float | int:
    if len(expression) > _MAX_EXPRESSION_LENGTH:
        raise CalculationError("expression is too long")

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise CalculationError(f"could not parse the expression: {exc.msg}") from exc
    if _depth(tree) > _MAX_DEPTH:
        raise CalculationError("expression is nested too deeply")

    try:
        return _Evaluator().visit(tree)
    except CalculationError:
        raise
    except Exception as exc:
        raise CalculationError(str(exc)) from exc
