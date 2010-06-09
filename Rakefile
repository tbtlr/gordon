src_dir = 'src'
renderer_dir = File.join(src_dir, 'renderer')
dist_dir = 'dist'
build_dir = 'build'
base_files = [ 'base', 'stream', 'parser', 'movie' ].map { |file| File.join(src_dir, file + '.js') }
renderer_files = [ 'svg' ].map { |file| File.join(renderer_dir, file + '.js') }
build_files = base_files + renderer_files
intro = File.join(src_dir, 'intro.js')
outro = File.join(src_dir, 'outro.js')
output_file = File.join(dist_dir, 'gordon.js')
output_file_min = File.join(dist_dir, 'gordon.min.js')
compiler = File.join(build_dir, 'compiler.jar')

task :default => :min

task :gordon do
  sh 'mkdir -p ' + dist_dir
  sh 'cat ' + intro + ' > ' + output_file
  sh 'for file in ' + build_files.join(' ') + "; do echo | cat $file - | sed 's/^/    /' >> " + output_file + '; done'
  sh 'cat ' + outro + ' >> ' + output_file
end

task :min => :gordon do
  sh 'head -6 ' + output_file + ' > ' + output_file_min
  sh 'java -jar ' + compiler + ' --warning_level QUIET --js=' + output_file + ' >> ' + output_file_min
end

task :clean do
  sh 'rm -rf ' + dist_dir
end
