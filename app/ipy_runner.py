import io
import traceback
from contextlib import redirect_stdout, redirect_stderr
import ast


class IPythonRunner:
    def __init__(self):
        # Persistent environment shared across cell executions
        self.env = {"__name__": "__main__"}

    def reset(self):
        self.env = {"__name__": "__main__"}

    def run_code(self, code: str):
        stdout = io.StringIO()
        stderr = io.StringIO()
        result = None
        error = None
        tb = None

        try:
            # Parse the code into an abstract syntax tree
            tree = ast.parse(code, mode="exec")

            # Check if the last node in the body is an expression
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                # If it is, separate the statements to execute from the expression to evaluate
                exec_body = tree.body[:-1]
                eval_expr_node = tree.body[-1].value

                # Compile the part to be executed
                exec_module = ast.Module(body=exec_body, type_ignores=[])
                exec_code = compile(exec_module, "<cell>", "exec")

                # Compile the part to be evaluated
                eval_code = compile(
                    ast.Expression(body=eval_expr_node), "<cell>", "eval"
                )

                with redirect_stdout(stdout), redirect_stderr(stderr):
                    # Execute the main body of the code
                    exec(exec_code, self.env)
                    # Evaluate the last expression and store it as the result
                    result = eval(eval_code, self.env)
            else:
                # If the last line is not an expression, execute the whole code block
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    exec(compile(code, "<cell>", "exec"), self.env)

        except Exception as ex:
            error = str(ex)
            tb = traceback.format_exc()

        return {
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "result": result,
            "error": error,
            "traceback": tb,
        }
