use std::{
    env,
    io::{self, Read},
    process::{self, Command, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

fn main() {
    if let Err(error) = supervise_engine() {
        eprintln!("{error}");
        process::exit(1);
    }
}
fn supervise_engine() -> Result<(), String> {
    let runner_path = env::current_exe()
        .map_err(|error| format!("The engine runner path is unavailable: {error}"))?;
    let engine_path = runner_path.with_file_name("llama-server");
    let mut engine = Command::new(&engine_path)
        .args(env::args_os().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("The lesson-material engine could not start: {error}"))?;

    let (shutdown_sender, shutdown_receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut input = io::stdin();
        let mut buffer = [0_u8; 64];
        loop {
            match input.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
        }
        let _ = shutdown_sender.send(());
    });

    loop {
        if let Some(status) = engine
            .try_wait()
            .map_err(|error| format!("The lesson-material engine status is unavailable: {error}"))?
        {
            process::exit(status.code().unwrap_or(1));
        }

        if shutdown_receiver.try_recv().is_ok() {
            let _ = engine.kill();
            let _ = engine.wait();
            return Ok(());
        }

        thread::sleep(Duration::from_millis(100));
    }
}
