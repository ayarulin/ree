module ReeEnum
  module DSL
    def self.included(base)
      base.extend(ClassMethods)
    end

    def self.extended(base)
      base.extend(ClassMethods)
    end

    module ClassMethods
      def enum(name, &proc)
        dsl = Ree::ObjectDsl.new(
          Ree.container.packages_facade, name, self, :object
        )

        dsl.instance_exec(&proc) if block_given?

        klass = dsl.object.klass
        klass.send(:include, ReeEnum::Enumerable)
        klass.setup_enum(dsl.object.name)
        Ree.container.compile(dsl.package, name)
      end

      def register_as_mapper_type
        mapper_factory = ReeMapper.get_mapper_factory(
          Object.const_get(self.name.split('::').first)
        )

        klass = Class.new(ReeMapper::AbstractType) do
          def initialize(enum)
            @enum = enum
          end

          contract(
            ReeEnum::Value,
            Kwargs[
              role: Nilor[Symbol, ArrayOf[Symbol]]
            ] => String
          )
          def serialize(value, role: nil)
            value.to_s
          end

          contract(
            Any,
            Kwargs[
              role: Nilor[Symbol, ArrayOf[Symbol]]
            ] => ReeEnum::Value
          ).throws(ReeMapper::CoercionError)
          def cast(value, role: nil)
            if value.is_a?(String)
              enum_val = @enum.values.all.detect { |v| v.to_s == value }

              if !enum_val
                raise ReeMapper::CoercionError, "should be one of #{@enum.values.all.map(&:to_s).inspect}"
              end

              enum_val
            elsif value.is_a?(Integer)
              enum_val = @enum.values.all.detect { |v| v.to_i == value }

              if !enum_val
                raise ReeMapper::CoercionError, "should be one of #{@enum.values.all.map(&:to_s).inspect}"
              end

              enum_val
            else
              raise ReeMapper::CoercionError, "should be one of #{@enum.values.all.map(&:to_s).inspect}"
            end
          end

          contract(
            ReeEnum::Value,
            Kwargs[
              role: Nilor[Symbol, ArrayOf[Symbol]]
            ] => Integer
          )
          def db_dump(value, role: nil)
            value.to_i
          end

          contract(
            Integer,
            Kwargs[
              role: Nilor[Symbol, ArrayOf[Symbol]]
            ] => ReeEnum::Value
          ).throws(ReeMapper::TypeError)
          def db_load(value, role: nil)
            cast(value, role: role)
          end
        end

        mapper_factory.register(
          self.enum_name,
          ReeMapper::Mapper.build(
            mapper_factory.strategies, klass.new(self)
          )
        )
      end
    end
  end
end