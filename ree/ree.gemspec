# frozen_string_literal: true

require_relative "lib/ree/version"

Gem::Specification.new do |spec|
  spec.name = "ree"
  spec.version = Ree::VERSION
  spec.authors = ["Ruslan Gatiyatov"]
  spec.email = ["ruslan.gatiyatov@gmail.com"]

  spec.summary = "Ruby framework to create modular applications"
  spec.description = "Ree makes your ruby life happier"
  spec.homepage = "https://github.com/glabix/ree/tree/main/ree"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1"
  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/glabix/ree/tree/main/ree"
  spec.metadata["changelog_uri"] = "https://github.com/glabix/ree/blob/main/ree/CHANGELOG.md"

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    `git ls-files -z`.split("\x0").reject do |f|
      (f == __FILE__) || f.match(%r{\A(?:(?:test|spec|features)/|\.(?:git|travis|circleci)|appveyor)})
    end
  end

  spec.bindir = "exe"
  spec.executables = spec.files.grep(%r{\Aexe/}) { |f| File.basename(f) }
  spec.require_paths = ["lib"]

  spec.add_dependency "commander", "~> 4.6.0"
  spec.add_dependency "abbrev"
  spec.add_development_dependency "debug"
end
