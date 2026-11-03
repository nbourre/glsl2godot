float fib(float n) { return n < 2. ? n : fib(n - 1.) + fib(n - 2.); }
void mainImage(out vec4 c, in vec2 f) { c = vec4(fib(5.) / 5.); }
