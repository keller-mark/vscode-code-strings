# lang: js
my_js_string = """
function add(a, b) {
    return a + b;
}

const result = add(5, 10);
console.log("Result:", result);
"""

# lang: python
my_python_string = """
def calculate_fibonacci(n):
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

result = calculate_fibonacci(10)
print(f"Fibonacci of 10: {result}")
"""

# lang: java
my_java_string = """
public class Calculator {
    public static int add(int a, int b) {
        return a + b;
    }
    
    public static void main(String[] args) {
        int result = add(5, 10);
        System.out.println("Result: " + result);
    }
}
""" 