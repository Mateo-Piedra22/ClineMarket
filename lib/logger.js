// ANSI Structured Logger for Cline Marketplace Control Plane

export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function ts() {
  return new Date().toISOString().slice(11, 19);
}

export const logger = {
  info(msg, ...args) {
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.cyan}INFO${colors.reset}  ${msg}`, ...args);
  },
  warn(msg, ...args) {
    console.warn(`${colors.dim}[${ts()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${msg}`, ...args);
  },
  error(msg, ...args) {
    console.error(`${colors.dim}[${ts()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${msg}`, ...args);
  },
  success(msg, ...args) {
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.green}OK${colors.reset}    ${msg}`, ...args);
  },
  exec(cmd, durationMs, code = 0) {
    const status = code === 0
      ? `${colors.green}exit 0${colors.reset}`
      : `${colors.red}exit ${code}${colors.reset}`;
    const dur = `${colors.dim}(${durationMs}ms)${colors.reset}`;
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.magenta}EXEC${colors.reset}  ${cmd} -> ${status} ${dur}`);
  },
  http(method, path, status, durationMs) {
    const col = status < 400 ? colors.green : status < 500 ? colors.yellow : colors.red;
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.blue}HTTP${colors.reset}  ${method} ${path} -> ${col}${status}${colors.reset} ${colors.dim}(${durationMs}ms)${colors.reset}`);
  },
};
